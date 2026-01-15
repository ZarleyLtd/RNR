/**
 * Google Apps Script for Holiday Home Booking System
 * 
 * Setup Instructions:
 * 1. Create a new Google Sheet with columns: Guest Name | Room | Start Date | End Date | Notes | PIN
 * 2. Deploy this script as a Web App (Execute as: Me, Who has access: Anyone)
 * 3. Copy the Web App URL and update the API_URL in app.js
 * 4. Set the FAMILY_ACCESS_CODE constant (optional, additional security)
 */

// Configuration
const SHEET_NAME = 'Bookings'; // Name of the sheet tab
const ACTIVITY_LOG_SHEET = 'ActivityLog'; // Name of the activity log sheet
const SETTINGS_SHEET = 'Settings'; // Name of the settings sheet
const DEFAULT_FAMILY_PASSWORD = 'rnr'; // Default family password
const DEFAULT_ADMIN_PASSWORD = 'rnrAdmin'; // Default admin password
const FAMILY_ACCESS_CODE = 'family2024'; // Optional: Additional security layer (deprecated)

/**
 * Handle GET requests - Retrieve all bookings or settings
 */
function doGet(e) {
  try {
    const action = e.parameter ? e.parameter.action : null;
    
    // Handle settings request
    if (action === 'settings') {
      const settings = getSettings();
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          settings: settings
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Default: retrieve bookings
    const sheet = getSheet();
    
    // Get all rows except header
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    // Convert rows to booking objects
    const bookings = rows
      .map((row, index) => {
        const rowNum = index + 2; // +2 because index is 0-based and we skip header (row 1)
        return {
          id: rowNum,
          rowId: rowNum, // Store row number for updates/deletes
          guestName: row[0] || '',
          room: row[1] || '',
          startDate: formatDateISO(row[2]),
          endDate: formatDateISO(row[3]),
          notes: row[4] || '',
          pin: String(row[5] || '').replace(/\s+/g, ' ').trim() // Normalize PIN: all whitespace sequences to single space, then trim
        };
      })
      .filter(booking => booking.guestName !== ''); // Filter out empty rows
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        bookings: bookings
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests - Create, Update, Delete bookings, or Log activity
 */
function doPost(e) {
  try {
    // Handle request data - support both JSON and form data
    let postData;
    if (e.parameter && Object.keys(e.parameter).length > 0) {
      // URL-encoded form data (from form submission)
      postData = e.parameter;
    } else if (e.postData && e.postData.contents) {
      // JSON request
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (parseError) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            message: 'Invalid JSON format: ' + parseError.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } else {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'No data received'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const action = postData.action || 'create';
    
    // Route to appropriate handler
    switch (action) {
      case 'create':
        return handleCreateBooking(postData);
      case 'update':
        return handleUpdateBooking(postData);
      case 'delete':
        return handleDeleteBooking(postData);
      case 'logActivity':
        return handleLogActivity(postData);
      default:
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            message: 'Invalid action: ' + action
          }))
          .setMimeType(ContentService.MimeType.JSON);
    }
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle creating a new booking
 */
function handleCreateBooking(postData) {
  const sheet = getSheet();
  
  // Validate required fields (PIN is now optional)
  if (!postData.guestName || !postData.room || !postData.startDate || !postData.endDate) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Missing required fields'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Validate room - can be "Entire House", single room, or comma-separated rooms
  const validRooms = ['Entire House', 'Master', 'Twin', 'Bunk'];
  const roomValue = postData.room;
  
  // Check if it's a comma-separated list of rooms
  if (roomValue.includes(',')) {
    const rooms = roomValue.split(',').map(r => r.trim());
    // Validate all rooms in the list are valid
    const invalidRooms = rooms.filter(r => !validRooms.includes(r));
    if (invalidRooms.length > 0) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Invalid room selection: ' + invalidRooms.join(', ')
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } else if (!validRooms.includes(roomValue)) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Invalid room selection'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Check for date conflicts (optional validation)
  const hasConflict = checkBookingConflict(sheet, postData.room, postData.startDate, postData.endDate, null);
  if (hasConflict) {
    let conflictMessage;
    if (postData.room === 'Entire House') {
      conflictMessage = 'The entire house is already booked for the selected dates';
    } else if (postData.room.includes(',')) {
      conflictMessage = 'One or more of the selected rooms are already booked for the selected dates';
    } else {
      conflictMessage = 'This room is already booked for the selected dates';
    }
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: conflictMessage
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Get the next row number for ID
  const lastRow = sheet.getLastRow();
  const newRowNum = lastRow + 1;
  
  // Append new booking to sheet
  // Ensure PIN is stored as string (Google Sheets may convert numeric strings to numbers)
  // Normalize PIN: replace all whitespace sequences with single space, then trim
  const normalizedPin = String(postData.pin || '').replace(/\s+/g, ' ').trim();
  sheet.appendRow([
    postData.guestName || '',
    postData.room || '',
    postData.startDate || '',
    postData.endDate || '',
    postData.notes || '',
    normalizedPin // Store PIN as normalized string
  ]);
  
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Booking created successfully',
      bookingId: newRowNum
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle updating an existing booking
 */
function handleUpdateBooking(postData) {
  const sheet = getSheet();
  
  if (!postData.bookingId) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Missing booking ID'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const rowNum = parseInt(postData.bookingId);
  if (isNaN(rowNum) || rowNum < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Invalid booking ID'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Check if row exists
  const lastRow = sheet.getLastRow();
  if (rowNum > lastRow) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Booking not found'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Get existing booking to verify PIN (if provided and booking has a PIN)
  const existingRow = sheet.getRange(rowNum, 1, 1, 6).getValues()[0];
  const existingPin = String(existingRow[5] || '').replace(/\s+/g, ' ').trim();
  
  // If booking has a PIN and a PIN is provided in the request, verify it
  // If booking has no PIN, skip verification
  if (existingPin !== '' && postData.pin) {
    const providedPin = String(postData.pin || '').replace(/\s+/g, ' ').trim();
    if (providedPin !== existingPin) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Invalid PIN code'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Validate room if provided - can be "Entire House", single room, or comma-separated rooms
  if (postData.room) {
    const validRooms = ['Entire House', 'Master', 'Twin', 'Bunk'];
    const roomValue = postData.room;
    
    // Check if it's a comma-separated list of rooms
    if (roomValue.includes(',')) {
      const rooms = roomValue.split(',').map(r => r.trim());
      // Validate all rooms in the list are valid
      const invalidRooms = rooms.filter(r => !validRooms.includes(r));
      if (invalidRooms.length > 0) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            message: 'Invalid room selection: ' + invalidRooms.join(', ')
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } else if (!validRooms.includes(roomValue)) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Invalid room selection'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Check for date conflicts (excluding current booking)
  if (postData.room && postData.startDate && postData.endDate) {
    const hasConflict = checkBookingConflict(sheet, postData.room, postData.startDate, postData.endDate, rowNum);
    if (hasConflict) {
      let conflictMessage;
      if (postData.room === 'Entire House') {
        conflictMessage = 'The entire house is already booked for the selected dates';
      } else if (postData.room.includes(',')) {
        conflictMessage = 'One or more of the selected rooms are already booked for the selected dates';
      } else {
        conflictMessage = 'This room is already booked for the selected dates';
      }
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: conflictMessage
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Update the row
  const updateData = [
    postData.guestName !== undefined ? postData.guestName : existingRow[0],
    postData.room !== undefined ? postData.room : existingRow[1],
    postData.startDate !== undefined ? postData.startDate : existingRow[2],
    postData.endDate !== undefined ? postData.endDate : existingRow[3],
    postData.notes !== undefined ? postData.notes : existingRow[4],
    existingRow[5] // Keep existing PIN
  ];
  
  sheet.getRange(rowNum, 1, 1, 6).setValues([updateData]);
  
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Booking updated successfully'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle deleting a booking
 */
function handleDeleteBooking(postData) {
  const sheet = getSheet();
  
  if (!postData.bookingId) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Missing booking ID'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const rowNum = parseInt(postData.bookingId);
  if (isNaN(rowNum) || rowNum < 2) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Invalid booking ID'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Check if row exists
  const lastRow = sheet.getLastRow();
  if (rowNum > lastRow) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Booking not found'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Delete the row
  sheet.deleteRow(rowNum);
  
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Booking deleted successfully'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle logging activity
 */
function handleLogActivity(postData) {
  try {
    const activitySheet = getActivityLogSheet();
    
    if (!postData.activity) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Missing activity data'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    let activity;
    if (typeof postData.activity === 'string') {
      activity = JSON.parse(postData.activity);
    } else {
      activity = postData.activity;
    }
    
    // Append activity log entry
    activitySheet.appendRow([
      activity.timestamp || new Date().toISOString(),
      activity.action || '',
      activity.bookingId || '',
      JSON.stringify(activity.data || {}),
      JSON.stringify(activity.sessionInfo || {})
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Activity logged successfully'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // Silently fail for activity logging - don't break the main flow
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get or create the Bookings sheet
 */
function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    
    // Add headers (now includes Notes and PIN)
    sheet.getRange(1, 1, 1, 6).setValues([['Guest Name', 'Room', 'Start Date', 'End Date', 'Notes', 'PIN']]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, 6);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
  } else {
    // Check if we need to add new columns (for existing sheets)
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.length < 6) {
      // Add missing columns
      if (headers.length < 5) {
        sheet.getRange(1, 5).setValue('Notes');
      }
      if (headers.length < 6) {
        sheet.getRange(1, 6).setValue('PIN');
      }
      // Reformat header
      const headerRange = sheet.getRange(1, 1, 1, 6);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4a5568');
      headerRange.setFontColor('#ffffff');
    }
  }
  
  return sheet;
}

/**
 * Get or create the Activity Log sheet
 */
function getActivityLogSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ACTIVITY_LOG_SHEET);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ACTIVITY_LOG_SHEET);
    
    // Add headers
    sheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Action', 'Booking ID', 'Data', 'Session Info']]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, 5);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
  }
  
  return sheet;
}

/**
 * Get or create the Settings sheet
 */
function getSettingsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SETTINGS_SHEET);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SETTINGS_SHEET);
    
    // Add headers
    sheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, 2);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
    
    // Add default settings
    sheet.appendRow(['Family Password', DEFAULT_FAMILY_PASSWORD]);
    sheet.appendRow(['Admin Password', DEFAULT_ADMIN_PASSWORD]);
  }
  
  return sheet;
}

/**
 * Get settings from the Settings sheet
 * Returns an object with setting names as keys and values as values
 */
function getSettings() {
  const sheet = getSettingsSheet();
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1); // Skip header
  
  const settings = {};
  
  // Use defaults if sheet is empty
  settings['Family Password'] = DEFAULT_FAMILY_PASSWORD;
  settings['Admin Password'] = DEFAULT_ADMIN_PASSWORD;
  
  // Override with values from sheet if they exist
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] && row[0] !== '') {
      settings[row[0]] = row[1] || '';
    }
  }
  
  return settings;
}

/**
 * Check if a booking conflicts with existing bookings
 * @param {Sheet} sheet - The bookings sheet
 * @param {string} room - Room name
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @param {number} excludeRowNum - Row number to exclude from conflict check (for updates)
 */
function checkBookingConflict(sheet, room, startDate, endDate, excludeRowNum) {
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1); // Skip header
  
  const newStart = new Date(startDate);
  const newEnd = new Date(endDate);
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === '') continue; // Skip empty rows
    
    // Skip the row we're updating
    const currentRowNum = i + 2; // +2 because index is 0-based and we skip header (row 1)
    if (excludeRowNum && currentRowNum === excludeRowNum) {
      continue;
    }
    
    const existingRoom = row[1];
    const existingStart = new Date(row[2]);
    const existingEnd = new Date(row[3]);
    
    // Check for overlap: new booking overlaps if it starts before existing ends and ends after existing starts
    const datesOverlap = newStart < existingEnd && newEnd > existingStart;
    
    if (!datesOverlap) continue; // No date overlap, skip
    
    // Parse new booking rooms (could be "Entire House", single room, or comma-separated)
    const newRooms = room === 'Entire House' ? ['Entire House'] : room.split(',').map(r => r.trim());
    
    // Parse existing booking rooms
    const existingRooms = existingRoom === 'Entire House' ? ['Entire House'] : existingRoom.split(',').map(r => r.trim());
    
    // If new booking is "Entire House", conflict with any existing booking
    if (newRooms.includes('Entire House')) {
      return true; // Conflict found
    }
    
    // If existing booking is "Entire House", conflict with any new booking
    if (existingRooms.includes('Entire House')) {
      return true; // Conflict found
    }
    
    // Check if any room in new booking conflicts with any room in existing booking
    for (let i = 0; i < newRooms.length; i++) {
      if (existingRooms.includes(newRooms[i])) {
        return true; // Conflict found
      }
    }
  }
  
  return false; // No conflict
}

/**
 * Format date to ISO 8601 format (YYYY-MM-DD)
 */
function formatDateISO(date) {
  if (!date) return '';
  
  // If it's already a string in ISO format, return as-is
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return date;
  }
  
  // Convert Date object to ISO format
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
