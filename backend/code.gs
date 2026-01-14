/**
 * Google Apps Script for Holiday Home Booking System
 * 
 * Setup Instructions:
 * 1. Create a new Google Sheet with columns: Guest Name | Room | Start Date | End Date
 * 2. Deploy this script as a Web App (Execute as: Me, Who has access: Anyone)
 * 3. Copy the Web App URL and update the API_URL in app.js
 * 4. Set the FAMILY_ACCESS_CODE constant (optional, additional security)
 */

// Configuration
const SHEET_NAME = 'Bookings'; // Name of the sheet tab
const FAMILY_ACCESS_CODE = 'family2024'; // Optional: Additional security layer

/**
 * Handle GET requests - Retrieve all bookings
 */
function doGet(e) {
  try {
    const sheet = getSheet();
    
    // Get all rows except header
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    // Convert rows to booking objects
    const bookings = rows
      .filter(row => row[0] !== '') // Filter out empty rows
      .map((row, index) => {
        return {
          id: index + 1,
          guestName: row[0] || '',
          room: row[1] || '',
          startDate: formatDateISO(row[2]),
          endDate: formatDateISO(row[3])
        };
      });
    
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
 * Handle POST requests - Create a new booking
 */
function doPost(e) {
  try {
    const sheet = getSheet();
    
    // Handle request data - support both JSON and form data
    // Check e.parameter FIRST (form data), then e.postData.contents (JSON)
    let postData;
    if (e.parameter && (e.parameter.guestName || e.parameter.room)) {
      // URL-encoded form data (from form submission)
      postData = {
        guestName: e.parameter.guestName || '',
        room: e.parameter.room || '',
        startDate: e.parameter.startDate || '',
        endDate: e.parameter.endDate || ''
      };
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
    
    // Validate required fields
    if (!postData.guestName || !postData.room || !postData.startDate || !postData.endDate) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Missing required fields'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Validate room
    const validRooms = ['Entire House', 'Master', 'Twin', 'Bunk'];
    if (!validRooms.includes(postData.room)) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: 'Invalid room selection'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Check for date conflicts (optional validation)
    const hasConflict = checkBookingConflict(sheet, postData.room, postData.startDate, postData.endDate);
    if (hasConflict) {
      const conflictMessage = postData.room === 'Entire House' 
        ? 'The entire house is already booked for the selected dates'
        : 'This room is already booked for the selected dates';
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          message: conflictMessage
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Append new booking to sheet
    sheet.appendRow([
      postData.guestName,
      postData.room,
      postData.startDate,
      postData.endDate
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Booking created successfully'
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
 * Get or create the Bookings sheet
 */
function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    
    // Add headers
    sheet.getRange(1, 1, 1, 4).setValues([['Guest Name', 'Room', 'Start Date', 'End Date']]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, 4);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a5568');
    headerRange.setFontColor('#ffffff');
  }
  
  return sheet;
}

/**
 * Check if a booking conflicts with existing bookings
 */
function checkBookingConflict(sheet, room, startDate, endDate) {
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1); // Skip header
  
  const newStart = new Date(startDate);
  const newEnd = new Date(endDate);
  const allRooms = ['Master', 'Twin', 'Bunk'];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === '') continue; // Skip empty rows
    
    const existingRoom = row[1];
    const existingStart = new Date(row[2]);
    const existingEnd = new Date(row[3]);
    
    // Check for overlap: new booking overlaps if it starts before existing ends and ends after existing starts
    const datesOverlap = newStart < existingEnd && newEnd > existingStart;
    
    if (!datesOverlap) continue; // No date overlap, skip
    
    // If booking "Entire House", conflict with any existing booking
    if (room === 'Entire House') {
      return true; // Conflict found
    }
    
    // If existing booking is "Entire House", conflict with any new booking
    if (existingRoom === 'Entire House') {
      return true; // Conflict found
    }
    
    // If same room, conflict
    if (existingRoom === room) {
      return true; // Conflict found
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
