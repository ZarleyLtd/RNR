// Family Access Password (Change this to your desired password)
const FAMILY_PASSWORD = 'rnr';

// Placeholder API URL - Replace with your Google Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyenccYwHjyj6bRS3QWjq_0Ve_rVOTEwIb6xCm-pYPWorb0JxsJxqoDfsXpioqNvtOb/exec';

// Calendar state
let currentDate = new Date();
let bookings = [];

// Room configuration
const ROOMS = [
    { id: 'Master', title: 'Master Room' },
    { id: 'Twin', title: 'Twin Room' },
    { id: 'Bunk', title: 'Bunk Room' }
];

// Guest names configuration
const GUEST_NAMES = [
    'Kevin',
    'Maireadh',
    'Niamh',
    'David',
    'Carol',
    'John',
    'Deirdre',
    'Catherine'
];

// Date selection state
let selectedCheckin = null;
let selectedCheckout = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializePasswordCheck();
    initializeBookingModal();
    initializeCalendar();
    initializeMessageToast();
    initializeGuestNameSelect();
    initializeProceedButton();
    loadBookings();
});

// Password Check
function initializePasswordCheck() {
    const passwordOverlay = document.getElementById('passwordOverlay');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmit = document.getElementById('passwordSubmit');
    const passwordError = document.getElementById('passwordError');
    const mainContent = document.getElementById('mainContent');
    
    // Check if password is already stored
    const storedPassword = sessionStorage.getItem('familyAccess');
    if (storedPassword === FAMILY_PASSWORD) {
        passwordOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        return;
    }
    
    passwordSubmit.addEventListener('click', function() {
        const inputPassword = passwordInput.value.trim();
        if (inputPassword === FAMILY_PASSWORD) {
            sessionStorage.setItem('familyAccess', FAMILY_PASSWORD);
            passwordOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            passwordError.classList.add('hidden');
        } else {
            passwordError.classList.remove('hidden');
            passwordInput.value = '';
            passwordInput.focus();
        }
    });
    
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            passwordSubmit.click();
        }
    });
}

// Initialize custom calendar
function initializeCalendar() {
    renderCalendar();
}

// Render the scrollable multi-month calendar
function renderCalendar() {
    const calendarContainer = document.getElementById('calendarMonthsGrid');
    if (!calendarContainer) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let html = '';
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    
    // Render 12 months: current month + next 11 months
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const displayDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const monthName = monthNames[month];
        
        html += '<div class="calendar-month">';
        html += `<div class="calendar-month-header">${monthName} ${year}</div>`;
        
        // Weekday headers
        html += '<div class="calendar-weekdays">';
        weekDays.forEach(day => {
            html += `<div class="calendar-weekday">${day}</div>`;
        });
        html += '</div>';
        
        // Calendar days grid
        html += '<div class="calendar-days-grid">';
        
        // Get first day of month and days in month
        // Adjust for Monday-first week (0=Sunday, 1=Monday, etc.)
        let firstDay = new Date(year, month, 1).getDay();
        // Convert Sunday (0) to 6, Monday (1) to 0, etc.
        firstDay = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }
        
        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const date = new Date(year, month, day);
            const isToday = isSameDay(date, today);
            
            // Calculate availability for this date
            const availability = getDateAvailability(dateStr);
            const availabilityClass = availability.status;
            const todayClass = isToday ? 'today' : '';
            
            html += `<div class="calendar-day ${availabilityClass} ${todayClass}" data-date="${dateStr}" data-available="${availability.availableRooms}">`;
            html += day;
            html += '</div>';
        }
        
        html += '</div>'; // calendar-days-grid
        html += '</div>'; // calendar-month
    }
    
    calendarContainer.innerHTML = html;
    
    // Add click handlers to date cells for date selection
    calendarContainer.querySelectorAll('.calendar-day:not(.empty)').forEach(cell => {
        cell.addEventListener('click', function() {
            const dateStr = this.getAttribute('data-date');
            const isBooked = this.classList.contains('booked');
            
            // Don't allow selecting a fully booked date as check-in
            // But allow it as checkout (since that's the departure day)
            if (isBooked && !selectedCheckin) {
                return; // Can't select fully booked date as check-in
            }
            
            handleDateSelection(dateStr);
        });
    });
    
    // Update calendar display for selected dates
    updateCalendarSelection();
    
    // Scroll to current month on load
    const scrollContainer = document.querySelector('.calendar-scroll-container');
    if (scrollContainer) {
        // Wait for render to complete, then scroll
        setTimeout(() => {
            const firstMonth = calendarContainer.querySelector('.calendar-month');
            if (firstMonth) {
                firstMonth.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            }
        }, 100);
    }
}

// Get availability status for a specific date
function getDateAvailability(dateStr) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    const availableRooms = [];
    const bookedRooms = [];
    let entireHouseBooked = false;
    
    // Check for entire house bookings first
    entireHouseBooked = bookings.some(booking => {
        if (booking.room !== 'Entire House') return false;
        const bookingStart = new Date(booking.startDate);
        const bookingEnd = new Date(booking.endDate);
        bookingStart.setHours(0, 0, 0, 0);
        bookingEnd.setHours(0, 0, 0, 0);
        return date >= bookingStart && date < bookingEnd;
    });
    
    if (entireHouseBooked) {
        return {
            status: 'booked',
            availableRooms: [],
            bookedRooms: ROOMS.map(r => r.id),
            entireHouseBooked: true
        };
    }
    
    ROOMS.forEach(room => {
        // Check if this room is booked on this date
        const isBooked = bookings.some(booking => {
            if (booking.room !== room.id) return false;
            const bookingStart = new Date(booking.startDate);
            const bookingEnd = new Date(booking.endDate);
            bookingStart.setHours(0, 0, 0, 0);
            bookingEnd.setHours(0, 0, 0, 0);
            // Date is booked if it's >= start and < end
            return date >= bookingStart && date < bookingEnd;
        });
        
        if (isBooked) {
            bookedRooms.push(room.id);
        } else {
            availableRooms.push(room.id);
        }
    });
    
    // Determine status
    let status;
    if (bookedRooms.length === 0) {
        status = 'available'; // No rooms booked - all available
    } else if (availableRooms.length === 0) {
        status = 'booked'; // All rooms booked
    } else {
        status = 'partial'; // Some rooms booked
    }
    
    return {
        status: status,
        availableRooms: availableRooms,
        bookedRooms: bookedRooms,
        entireHouseBooked: false
    };
}


// Helper function to check if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// Format date for display (e.g., "Mon, 12 Jan 2026")
function formatDateDisplay(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const d = new Date(date);
    const dayName = days[d.getDay()];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    
    return `${dayName}, ${day} ${month} ${year}`;
}


// Load bookings from API
async function loadBookings() {
    try {
        const response = await fetch(`${API_URL}?action=get`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.bookings) {
                bookings = data.bookings;
                renderCalendar();
                renderBookingsList();
                // Restore date selection visual state after re-render
                if (selectedCheckin || selectedCheckout) {
                    updateCalendarSelection();
                    updateProceedButton();
                }
            }
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
        // Continue without bookings if API is not available
    }
}

// Initialize guest name select dropdown
function initializeGuestNameSelect() {
    const guestNameSelect = document.getElementById('guestNameSelect');
    const guestNameInput = document.getElementById('guestName');
    
    if (!guestNameSelect || !guestNameInput) return;
    
    // Populate dropdown with guest names
    GUEST_NAMES.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        guestNameSelect.appendChild(option);
    });
    
    // When a name is selected, populate the input
    guestNameSelect.addEventListener('change', function() {
        if (this.value) {
            guestNameInput.value = this.value;
        }
    });
    
    // When input is manually changed, sync with select
    guestNameInput.addEventListener('input', function() {
        if (GUEST_NAMES.includes(this.value)) {
            guestNameSelect.value = this.value;
        } else if (this.value) {
            guestNameSelect.value = '';
        }
    });
}

// Initialize proceed button
function initializeProceedButton() {
    const proceedButton = document.getElementById('proceedButton');
    if (!proceedButton) return;
    
    proceedButton.addEventListener('click', function() {
        openBookingModal();
    });
}

// Booking Modal Functions
function initializeBookingModal() {
    const bookingModal = document.getElementById('bookingModal');
    const bookingForm = document.getElementById('bookingForm');
    const closeModal = document.getElementById('closeModal');
    
    closeModal.addEventListener('click', function() {
        bookingModal.classList.add('hidden');
        bookingForm.reset();
        document.body.style.overflow = '';
        // Reset date selection
        selectedCheckin = null;
        selectedCheckout = null;
        updateCalendarSelection();
        updateProceedButton();
        const dateSelectionPanel = document.getElementById('dateSelectionPanel');
        if (dateSelectionPanel) {
            dateSelectionPanel.classList.add('hidden');
        }
    });
    
    bookingModal.addEventListener('click', function(e) {
        if (e.target === bookingModal) {
            bookingModal.classList.add('hidden');
            bookingForm.reset();
            document.body.style.overflow = '';
            // Reset date selection
            selectedCheckin = null;
            selectedCheckout = null;
            updateCalendarSelection();
            updateProceedButton();
            const dateSelectionPanel = document.getElementById('dateSelectionPanel');
            if (dateSelectionPanel) {
                dateSelectionPanel.classList.add('hidden');
            }
        }
    });
    
    bookingForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitButton = document.getElementById('submitButton');
        const submitButtonText = document.getElementById('submitButtonText');
        const submitButtonLoading = document.getElementById('submitButtonLoading');
        
        const formData = {
            guestName: document.getElementById('guestName').value.trim(),
            room: document.getElementById('roomSelect').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:243',message:'Form submit started',data:{formData:formData,apiUrl:API_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
        // #endregion
        
        // Validate dates
        if (new Date(formData.startDate) >= new Date(formData.endDate)) {
            showMessage('Check-out date must be after check-in date', 'error');
            return;
        }
        
        // Show loading state
        submitButton.disabled = true;
        submitButtonText.classList.add('hidden');
        submitButtonLoading.classList.remove('hidden');
        
        // Submit booking
        try {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:260',message:'Before fetch request',data:{url:API_URL,method:'POST',body:JSON.stringify(formData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
            // #endregion
            
            // Use URL-encoded form data to avoid CORS preflight issues
            // Google Apps Script Web Apps handle form data better than JSON POST
            const formBody = new URLSearchParams();
            formBody.append('guestName', formData.guestName);
            formBody.append('room', formData.room);
            formBody.append('startDate', formData.startDate);
            formBody.append('endDate', formData.endDate);
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:271',message:'Using form-urlencoded to avoid CORS',data:{formBody:formBody.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            const response = await fetch(API_URL, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formBody.toString()
            }).catch(async (fetchError) => {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:285',message:'Fetch error',data:{errorName:fetchError.name,errorMessage:fetchError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                throw fetchError;
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:267',message:'After fetch response',data:{status:response.status,statusText:response.statusText,ok:response.ok,headers:Object.fromEntries(response.headers)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
            // #endregion
            
            if (response.ok) {
                let result;
                try {
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:273',message:'Before response.json()',data:{status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    
                    const responseText = await response.text();
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:278',message:'Response text received',data:{responseText:responseText,length:responseText.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    
                    result = JSON.parse(responseText);
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:283',message:'After JSON parse',data:{result:result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                } catch (parseError) {
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:287',message:'JSON parse error',data:{error:parseError.message,stack:parseError.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    throw parseError;
                }
                
                if (result.success) {
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:294',message:'Booking success',data:{result:result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
                    // #endregion
                    
                    showMessage('Booking successfully created!', 'success');
                    bookingModal.classList.add('hidden');
                    bookingForm.reset();
                    document.body.style.overflow = '';
                    // Reset date selection
                    selectedCheckin = null;
                    selectedCheckout = null;
                    updateCalendarSelection();
                    updateProceedButton();
                    const dateSelectionPanel = document.getElementById('dateSelectionPanel');
                    if (dateSelectionPanel) {
                        dateSelectionPanel.classList.add('hidden');
                    }
                    // Reload bookings to show the new one
                    loadBookings();
                } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:305',message:'API returned success=false',data:{result:result,message:result.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    showMessage(result.message || 'Failed to create booking', 'error');
                }
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:311',message:'Response not OK',data:{status:response.status,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
                showMessage('Error connecting to server', 'error');
            }
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/6c453964-aada-481a-b699-6260cc2ff3aa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:350',message:'Catch block error',data:{errorMessage:error.message,errorStack:error.stack,errorName:error.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A,C,D'})}).catch(()=>{});
            // #endregion
            
            console.error('Error submitting booking:', error);
            
            // Provide more specific error message based on error type
            let errorMsg = 'Error submitting booking. Please try again.';
            if (error.message === 'Failed to fetch') {
                errorMsg = 'Network error: Could not connect to server. Please check your internet connection and ensure the Google Apps Script is deployed correctly.';
            }
            showMessage(errorMsg, 'error');
        } finally {
            // Hide loading state
            submitButton.disabled = false;
            submitButtonText.classList.remove('hidden');
            submitButtonLoading.classList.add('hidden');
        }
    });
}

// Check if any date in a range is fully booked (excluding checkout date)
// Checkout date can be fully booked since that's the departure day
function isDateRangeAvailable(checkin, checkout) {
    if (!checkin || !checkout) return true;
    
    const start = new Date(checkin);
    start.setHours(0, 0, 0, 0);
    const end = new Date(checkout);
    end.setHours(0, 0, 0, 0);
    
    // Check each date in the range (excluding checkout date itself)
    // Checkout date can be fully booked since guests leave that day
    const current = new Date(start);
    while (current < end) {
        const dateStr = current.toISOString().split('T')[0];
        const availability = getDateAvailability(dateStr);
        
        // If any date (except checkout) is fully booked, the range is not available
        if (availability.status === 'booked') {
            return false;
        }
        
        // Move to next day
        current.setDate(current.getDate() + 1);
    }
    
    return true;
}

// Get available rooms for a date range
function getAvailableRoomsForDateRange(checkin, checkout) {
    if (!checkin || !checkout) return [];
    
    const start = new Date(checkin);
    start.setHours(0, 0, 0, 0);
    const end = new Date(checkout);
    end.setHours(0, 0, 0, 0);
    
    // Start with all rooms (including Entire House)
    const allRooms = ['Entire House', ...ROOMS.map(r => r.id)];
    const availableRooms = new Set(allRooms);
    
    // Check each date in the range (excluding checkout date)
    const current = new Date(start);
    while (current < end) {
        const dateStr = current.toISOString().split('T')[0];
        const availability = getDateAvailability(dateStr);
        
        // If entire house is booked on this date, remove it
        if (availability.entireHouseBooked) {
            availableRooms.delete('Entire House');
        }
        
        // If any individual room is booked on this date, remove "Entire House" as well
        // (can't book entire house if any part is already booked)
        if (availability.bookedRooms.length > 0) {
            availableRooms.delete('Entire House');
        }
        
        // Remove any individual rooms that are booked on this date
        availability.bookedRooms.forEach(roomId => {
            availableRooms.delete(roomId);
        });
        
        // Move to next day
        current.setDate(current.getDate() + 1);
    }
    
    // Return as array, with Entire House first if available
    const result = [];
    if (availableRooms.has('Entire House')) {
        result.push('Entire House');
    }
    ROOMS.forEach(room => {
        if (availableRooms.has(room.id)) {
            result.push(room.id);
        }
    });
    
    return result;
}

// Handle date selection from calendar
function handleDateSelection(dateStr) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    // Check if this date is fully booked
    const availability = getDateAvailability(dateStr);
    const isFullyBooked = availability.status === 'booked';
    
    // If no checkin selected, or if clicking a date before/equal to current checkin, set as checkin
    if (!selectedCheckin || date <= selectedCheckin) {
        // Don't allow selecting a fully booked date as check-in
        if (isFullyBooked) {
            showMessage('Cannot select a fully booked date as check-in date.', 'error');
            return;
        }
        selectedCheckin = date;
        selectedCheckout = null;
    } else if (!selectedCheckout) {
        // If checkin is selected, set as checkout (must be after checkin)
        // Checkout date can be fully booked since that's the departure day
        if (date > selectedCheckin) {
            // Check if the date range is available (no fully booked dates in between)
            // Note: checkout date itself can be fully booked
            if (isDateRangeAvailable(selectedCheckin, date)) {
                selectedCheckout = date;
            } else {
                // Show error message and don't set checkout
                showMessage('Cannot select this date range. Some dates in between are fully booked.', 'error');
                return;
            }
        }
    } else {
        // Both dates selected, start fresh with new checkin
        // Don't allow selecting a fully booked date as check-in
        if (isFullyBooked) {
            showMessage('Cannot select a fully booked date as check-in date.', 'error');
            return;
        }
        selectedCheckin = date;
        selectedCheckout = null;
    }
    
    updateCalendarSelection();
    updateProceedButton();
}

// Update calendar visual selection
function updateCalendarSelection() {
    const calendarContainer = document.getElementById('calendarMonthsGrid');
    if (!calendarContainer) return;
    
    // Remove previous selection classes
    calendarContainer.querySelectorAll('.calendar-day').forEach(cell => {
        cell.classList.remove('selected', 'selected-range', 'selected-start', 'selected-end');
    });
    
    if (!selectedCheckin) return;
    
    const checkinStr = selectedCheckin.toISOString().split('T')[0];
    const checkoutStr = selectedCheckout ? selectedCheckout.toISOString().split('T')[0] : null;
    
    calendarContainer.querySelectorAll('.calendar-day:not(.empty)').forEach(cell => {
        const cellDateStr = cell.getAttribute('data-date');
        if (!cellDateStr) return;
        
        const cellDate = new Date(cellDateStr);
        cellDate.setHours(0, 0, 0, 0);
        
        if (cellDateStr === checkinStr) {
            cell.classList.add('selected', 'selected-start');
        } else if (checkoutStr && cellDateStr === checkoutStr) {
            cell.classList.add('selected', 'selected-end');
        } else if (checkoutStr && cellDate > selectedCheckin && cellDate < selectedCheckout) {
            cell.classList.add('selected-range');
        }
    });
}

// Update proceed button visibility and nights count
function updateProceedButton() {
    const proceedButton = document.getElementById('proceedButton');
    const nightsMessage = document.getElementById('nightsMessage');
    const dateSelectionPanel = document.getElementById('dateSelectionPanel');
    
    if (!proceedButton) return;
    
    if (selectedCheckin && selectedCheckout) {
        const nights = Math.ceil((selectedCheckout - selectedCheckin) / (1000 * 60 * 60 * 24));
        proceedButton.disabled = false;
        proceedButton.classList.remove('opacity-50', 'cursor-not-allowed');
        if (nightsMessage) {
            nightsMessage.textContent = `${nights} ${nights === 1 ? 'night' : 'nights'} selected`;
            nightsMessage.classList.remove('hidden');
        }
        if (dateSelectionPanel) {
            dateSelectionPanel.classList.remove('hidden');
        }
    } else {
        proceedButton.disabled = true;
        proceedButton.classList.add('opacity-50', 'cursor-not-allowed');
        if (nightsMessage) {
            nightsMessage.classList.add('hidden');
        }
        if (dateSelectionPanel && (!selectedCheckin || !selectedCheckout)) {
            dateSelectionPanel.classList.add('hidden');
        }
    }
}

// Open booking modal with selected dates
function openBookingModal() {
    if (!selectedCheckin || !selectedCheckout) {
        return;
    }
    
    const bookingModal = document.getElementById('bookingModal');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const checkinDateDisplay = document.getElementById('checkinDateDisplay');
    const checkoutDateDisplay = document.getElementById('checkoutDateDisplay');
    const guestNameSelect = document.getElementById('guestNameSelect');
    const guestNameInput = document.getElementById('guestName');
    const roomSelect = document.getElementById('roomSelect');
    
    // Set hidden date inputs for form submission
    const checkinStr = selectedCheckin.toISOString().split('T')[0];
    const checkoutStr = selectedCheckout.toISOString().split('T')[0];
    startDateInput.value = checkinStr;
    endDateInput.value = checkoutStr;
    
    // Display formatted dates
    if (checkinDateDisplay) {
        checkinDateDisplay.textContent = formatDateDisplay(selectedCheckin);
    }
    if (checkoutDateDisplay) {
        checkoutDateDisplay.textContent = formatDateDisplay(selectedCheckout);
    }
    
    // Update room select to only show available rooms
    if (roomSelect) {
        // Get available rooms for the selected date range
        const availableRooms = getAvailableRoomsForDateRange(selectedCheckin, selectedCheckout);
        
        // Clear existing options (except the first "Select a room" option)
        roomSelect.innerHTML = '<option value="">Select a room</option>';
        
        // Add available rooms
        availableRooms.forEach(roomId => {
            const option = document.createElement('option');
            option.value = roomId;
            option.textContent = roomId === 'Entire House' ? 'Entire House' : roomId;
            roomSelect.appendChild(option);
        });
        
        // Reset selection
        roomSelect.value = '';
    }
    
    // Reset guest name fields
    if (guestNameSelect) guestNameSelect.value = '';
    if (guestNameInput) guestNameInput.value = '';
    
    bookingModal.classList.remove('hidden');
    
    // Prevent body scroll on mobile when modal is open
    if (window.innerWidth <= 768) {
        document.body.style.overflow = 'hidden';
    }
    
    // Small delay for focus on mobile
    setTimeout(() => {
        if (guestNameSelect) {
            guestNameSelect.focus();
        } else if (guestNameInput) {
            guestNameInput.focus();
        }
    }, 100);
}

// Update end date minimum based on start date
function updateEndDateMin() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput.value) {
        const checkinDate = new Date(startDateInput.value);
        checkinDate.setDate(checkinDate.getDate() + 1);
        endDateInput.min = checkinDate.toISOString().split('T')[0];
        
        // If current end date is before new min, update it
        if (endDateInput.value && new Date(endDateInput.value) < checkinDate) {
            endDateInput.value = checkinDate.toISOString().split('T')[0];
        }
    } else {
        const today = new Date().toISOString().split('T')[0];
        endDateInput.min = today;
    }
}

// Get icon for room type
function getRoomIcon(roomType) {
    const icons = {
        'Entire House': '🏠',
        'Master': '👑',
        'Twin': '🛏️',
        'Bunk': '🚂'
    };
    return icons[roomType] || '🛏️';
}

// Render bookings list (current month to 12 months ahead)
function renderBookingsList() {
    const bookingsListContainer = document.getElementById('bookingsList');
    if (!bookingsListContainer) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Start from the beginning of the current month
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfCurrentMonth.setHours(0, 0, 0, 0);
    
    // Calculate date 12 months from the start of current month
    const maxDate = new Date(startOfCurrentMonth);
    maxDate.setMonth(maxDate.getMonth() + 12);
    
    // Filter bookings within the date range (from start of current month to 12 months ahead)
    const upcomingBookings = bookings
        .filter(booking => {
            const startDate = new Date(booking.startDate);
            startDate.setHours(0, 0, 0, 0);
            return startDate >= startOfCurrentMonth && startDate <= maxDate;
        })
        .sort((a, b) => {
            const dateA = new Date(a.startDate);
            const dateB = new Date(b.startDate);
            return dateA - dateB;
        });
    
    if (upcomingBookings.length === 0) {
        bookingsListContainer.innerHTML = '<p class="text-[#4a5568] text-center py-8">No current bookings</p>';
        return;
    }
    
    // Format dates for display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const month = monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        return `${month} ${day}, ${year}`;
    }
    
    let html = '';
    upcomingBookings.forEach(booking => {
        const roomIcon = getRoomIcon(booking.room);
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div class="flex-1 flex items-start gap-3">
                        <span class="text-2xl flex-shrink-0">${roomIcon}</span>
                        <div class="flex-1">
                            <div class="font-semibold text-[#1e293b] mb-1">${escapeHtml(booking.guestName)}</div>
                            <div class="text-sm text-[#475569]">
                                <span class="font-medium">${booking.room} Room</span> • 
                                ${formatDate(booking.startDate)} - ${formatDate(booking.endDate)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    bookingsListContainer.innerHTML = html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize message modal close button
function initializeMessageToast() {
    const closeMessageModal = document.getElementById('closeMessageModal');
    const messageModal = document.getElementById('messageModal');
    
    if (closeMessageModal) {
        closeMessageModal.addEventListener('click', function() {
            messageModal.classList.add('hidden');
            document.body.style.overflow = '';
        });
    }
    
    // Prevent closing by clicking outside the modal
    if (messageModal) {
        messageModal.addEventListener('click', function(e) {
            if (e.target === messageModal) {
                // Don't close on backdrop click - require button click
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }
}

// Show message modal (centered, blocks interactions until acknowledged)
function showMessage(message, type = 'success') {
    const messageModal = document.getElementById('messageModal');
    const messageText = document.getElementById('messageText');
    const messageIcon = document.getElementById('messageIcon');
    
    messageText.textContent = message;
    messageText.className = type === 'error' ? 'text-red-600' : 'text-green-600';
    
    // Set icon
    if (type === 'error') {
        messageIcon.textContent = '✕';
        messageIcon.className = 'mb-4 text-5xl text-red-600';
    } else {
        messageIcon.textContent = '✓';
        messageIcon.className = 'mb-4 text-5xl text-green-600';
    }
    
    messageModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Don't auto-hide - user must click OK button
}
