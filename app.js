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

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializePasswordCheck();
    initializeBookingModal();
    initializeCalendar();
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
    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    
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
        const firstDay = new Date(year, month, 1).getDay();
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
    
    // Add click handlers to date cells
    calendarContainer.querySelectorAll('.calendar-day:not(.empty):not(.booked)').forEach(cell => {
        cell.addEventListener('click', function() {
            const dateStr = this.getAttribute('data-date');
            openBookingModal(dateStr, null);
        });
    });
    
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
        bookedRooms: bookedRooms
    };
}


// Helper function to check if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
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
            }
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
        // Continue without bookings if API is not available
    }
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
    });
    
    bookingModal.addEventListener('click', function(e) {
        if (e.target === bookingModal) {
            bookingModal.classList.add('hidden');
            bookingForm.reset();
            document.body.style.overflow = '';
        }
    });
    
    bookingForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
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
        }
    });
}

// Open booking modal (can be called from onclick in mobile view)
function openBookingModal(dateStr, resourceId) {
    const bookingModal = document.getElementById('bookingModal');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const roomSelect = document.getElementById('roomSelect');
    
    // Set default values
    if (dateStr) {
        startDateInput.value = dateStr;
    }
    if (resourceId) {
        roomSelect.value = resourceId;
    }
    
    // Set minimum dates
    const today = new Date().toISOString().split('T')[0];
    startDateInput.min = today;
    endDateInput.min = today;
    
    bookingModal.classList.remove('hidden');
    
    // Prevent body scroll on mobile when modal is open
    if (window.innerWidth <= 768) {
        document.body.style.overflow = 'hidden';
    }
    
    // Small delay for focus on mobile
    setTimeout(() => {
        document.getElementById('guestName').focus();
    }, 100);
}

// Show message toast
function showMessage(message, type = 'success') {
    const messageToast = document.getElementById('messageToast');
    const messageText = document.getElementById('messageText');
    
    messageText.textContent = message;
    messageText.className = type === 'error' ? 'text-red-600' : 'text-green-600';
    messageToast.classList.remove('hidden');
    
    setTimeout(() => {
        messageToast.classList.add('hidden');
    }, 3000);
}
