// Default passwords (will be overridden by settings from backend)
let FAMILY_PASSWORD = 'rnr';
let ADMIN_PASSWORD = 'rnrAdmin';

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

// Activity log storage (in-memory, could be extended to use localStorage or API)
let activityLog = [];

// Current booking being edited
let currentEditingBooking = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Load settings first, then initialize password check
    loadSettings().then(() => {
        initializePasswordCheck();
        initializeBookingModal();
        initializeCalendar();
        initializeMessageToast();
        initializeGuestNameSelect();
        initializeProceedButton();
        initializePinVerificationModal();
        initializeEditBookingModal();
        initializeActivityLogModal();
        loadBookings();
        loadActivityLog();
        updateActivityLogButtonVisibility();
    });
});

// Load settings from backend
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}?action=settings`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.settings) {
                FAMILY_PASSWORD = data.settings['Family Password'] || 'rnr';
                ADMIN_PASSWORD = data.settings['Admin Password'] || 'rnrAdmin';
            }
        }
    } catch (error) {
        console.warn('Could not load settings from backend, using defaults:', error);
        // Continue with default passwords
    }
}

// Password Check
function initializePasswordCheck() {
    const passwordOverlay = document.getElementById('passwordOverlay');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmit = document.getElementById('passwordSubmit');
    const passwordError = document.getElementById('passwordError');
    const mainContent = document.getElementById('mainContent');
    
    // Check if password is already stored and valid
    const storedPassword = sessionStorage.getItem('familyAccess');
    const storedAdminStatus = sessionStorage.getItem('isAdmin') === 'true';
    
    // Validate stored password against current settings
    if (storedPassword) {
        if (storedPassword === FAMILY_PASSWORD) {
            // Valid family password
            passwordOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            updateActivityLogButtonVisibility();
            return;
        } else if (storedPassword === ADMIN_PASSWORD && storedAdminStatus) {
            // Valid admin password
            passwordOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            updateActivityLogButtonVisibility();
            return;
        } else {
            // Stored password no longer valid (settings changed), clear it
            sessionStorage.removeItem('familyAccess');
            sessionStorage.removeItem('isAdmin');
        }
    }
    
    passwordSubmit.addEventListener('click', function() {
        const inputPassword = passwordInput.value.trim();
        let isAdmin = false;
        let isValidPassword = false;
        
        // Check if it's the admin password
        if (inputPassword === ADMIN_PASSWORD) {
            isAdmin = true;
            isValidPassword = true;
        } 
        // Check if it's the family password
        else if (inputPassword === FAMILY_PASSWORD) {
            isAdmin = false;
            isValidPassword = true;
        }
        
        if (isValidPassword) {
            sessionStorage.setItem('familyAccess', inputPassword);
            sessionStorage.setItem('isAdmin', isAdmin.toString());
            passwordOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            passwordError.classList.add('hidden');
            updateActivityLogButtonVisibility();
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

// Check if current user is admin
function isAdmin() {
    return sessionStorage.getItem('isAdmin') === 'true';
}

// Update activity log button visibility based on admin status
function updateActivityLogButtonVisibility() {
    const viewActivityLogButton = document.getElementById('viewActivityLogButton');
    if (viewActivityLogButton) {
        if (isAdmin()) {
            viewActivityLogButton.classList.remove('hidden');
        } else {
            viewActivityLogButton.classList.add('hidden');
        }
    }
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
            endDate: document.getElementById('endDate').value,
            notes: document.getElementById('bookingNotes').value.trim(),
            pin: normalizePin(document.getElementById('bookingPin').value) // Normalize PIN when creating
        };
        
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
            // Use URL-encoded form data to avoid CORS preflight issues
            // Google Apps Script Web Apps handle form data better than JSON POST
            const formBody = new URLSearchParams();
            formBody.append('action', 'create');
            formBody.append('guestName', formData.guestName);
            formBody.append('room', formData.room);
            formBody.append('startDate', formData.startDate);
            formBody.append('endDate', formData.endDate);
            formBody.append('notes', formData.notes);
            formBody.append('pin', formData.pin);
            
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
                throw fetchError;
            });
            
            if (response.ok) {
                let result;
                try {
                    const responseText = await response.text();
                    result = JSON.parse(responseText);
                } catch (parseError) {
                    throw parseError;
                }
                
                if (result.success) {
                    // Log activity
                    logActivity('create', {
                        guestName: formData.guestName,
                        room: formData.room,
                        startDate: formData.startDate,
                        endDate: formData.endDate,
                        notes: formData.notes
                    }, result.bookingId);
                    
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
                    showMessage(result.message || 'Failed to create booking', 'error');
                }
            } else {
                showMessage('Error connecting to server', 'error');
            }
        } catch (error) {
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
        const bookingId = booking.id || booking.rowId || JSON.stringify(booking);
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer booking-item" data-booking-id="${escapeHtml(bookingId)}">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div class="flex-1 flex items-start gap-3">
                        <span class="text-2xl flex-shrink-0">${roomIcon}</span>
                        <div class="flex-1">
                            <div class="font-semibold text-[#1e293b] mb-1">${escapeHtml(booking.guestName)}</div>
                            <div class="text-sm text-[#475569]">
                                <span class="font-medium">${booking.room} Room</span> • 
                                ${formatDate(booking.startDate)} - ${formatDate(booking.endDate)}
                            </div>
                            ${booking.notes ? `<div class="text-xs text-[#64748b] mt-1 italic">${escapeHtml(booking.notes)}</div>` : ''}
                        </div>
                    </div>
                    <div class="text-xs text-[#64748b] md:ml-4">Click to edit/delete</div>
                </div>
            </div>
        `;
    });
    
    bookingsListContainer.innerHTML = html;
    
    // Add click handlers to booking items
    bookingsListContainer.querySelectorAll('.booking-item').forEach(item => {
        item.addEventListener('click', function() {
            const bookingId = this.getAttribute('data-booking-id');
            const booking = upcomingBookings.find(b => {
                const bId = b.id || b.rowId || JSON.stringify(b);
                return String(bId) === String(bookingId);
            });
            if (booking) {
                openPinVerificationModal(booking);
            }
        });
    });
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
    
    // Close any other open modals to ensure error message is visible
    if (type === 'error') {
        const editModal = document.getElementById('editBookingModal');
        const pinModal = document.getElementById('pinVerificationModal');
        const bookingModal = document.getElementById('bookingModal');
        if (editModal && !editModal.classList.contains('hidden')) {
            editModal.classList.add('hidden');
        }
        if (pinModal && !pinModal.classList.contains('hidden')) {
            pinModal.classList.add('hidden');
        }
        if (bookingModal && !bookingModal.classList.contains('hidden')) {
            bookingModal.classList.add('hidden');
        }
    }
    
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

// Initialize PIN verification modal
function initializePinVerificationModal() {
    const pinModal = document.getElementById('pinVerificationModal');
    const closePinModal = document.getElementById('closePinModal');
    const cancelPinButton = document.getElementById('cancelPinButton');
    const verifyPinButton = document.getElementById('verifyPinButton');
    const pinInput = document.getElementById('pinInput');
    const pinError = document.getElementById('pinError');
    
    if (!pinModal) return;
    
    const closeModal = () => {
        pinModal.classList.add('hidden');
        pinInput.value = '';
        pinError.classList.add('hidden');
        document.body.style.overflow = '';
        currentEditingBooking = null;
    };
    
    if (closePinModal) {
        closePinModal.addEventListener('click', closeModal);
    }
    
    if (cancelPinButton) {
        cancelPinButton.addEventListener('click', closeModal);
    }
    
    if (verifyPinButton) {
        verifyPinButton.addEventListener('click', function() {
            verifyPinCode();
        });
    }
    
    if (pinInput) {
        pinInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verifyPinCode();
            }
        });
    }
    
    pinModal.addEventListener('click', function(e) {
        if (e.target === pinModal) {
            closeModal();
        }
    });
}

// Open PIN verification modal
function openPinVerificationModal(booking) {
    currentEditingBooking = booking;
    
    // Skip PIN verification if user is admin
    if (isAdmin()) {
        openEditBookingModal(booking);
        return;
    }
    
    const pinModal = document.getElementById('pinVerificationModal');
    const pinInput = document.getElementById('pinInput');
    const pinError = document.getElementById('pinError');
    
    if (!pinModal) return;
    
    pinInput.value = '';
    pinError.classList.add('hidden');
    pinModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        if (pinInput) pinInput.focus();
    }, 100);
}

// Normalize PIN: handle all whitespace characters and sequences
function normalizePin(pin) {
    if (!pin) return '';
    // Convert to string, replace all whitespace sequences (spaces, tabs, newlines, etc.) with single space, then trim
    return String(pin).replace(/\s+/g, ' ').trim();
}

// Verify PIN code
function verifyPinCode() {
    const pinInput = document.getElementById('pinInput');
    const pinError = document.getElementById('pinError');
    const pinModal = document.getElementById('pinVerificationModal');
    
    if (!currentEditingBooking || !pinInput) return;
    
    // Normalize both PINs: handle all whitespace characters and sequences
    const enteredPin = normalizePin(pinInput.value);
    const bookingPin = normalizePin(currentEditingBooking.pin);
    
    // Compare normalized PINs
    if (enteredPin === bookingPin && enteredPin !== '') {
        pinModal.classList.add('hidden');
        document.body.style.overflow = '';
        openEditBookingModal(currentEditingBooking);
    } else {
        pinError.classList.remove('hidden');
        pinInput.value = '';
        pinInput.focus();
    }
}

// Initialize edit booking modal
function initializeEditBookingModal() {
    const editModal = document.getElementById('editBookingModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const editForm = document.getElementById('editBookingForm');
    const deleteButton = document.getElementById('deleteBookingButton');
    
    if (!editModal) return;
    
    const closeModal = () => {
        editModal.classList.add('hidden');
        editForm.reset();
        document.body.style.overflow = '';
        currentEditingBooking = null;
    };
    
    if (closeEditModal) {
        closeEditModal.addEventListener('click', closeModal);
    }
    
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await updateBooking();
        });
    }
    
    if (deleteButton) {
        deleteButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
                deleteBooking();
            }
        });
    }
    
    editModal.addEventListener('click', function(e) {
        if (e.target === editModal) {
            closeModal();
        }
    });
    
    // Initialize guest name select for edit modal
    const editGuestNameSelect = document.getElementById('editGuestNameSelect');
    const editGuestNameInput = document.getElementById('editGuestName');
    
    if (editGuestNameSelect && editGuestNameInput) {
        GUEST_NAMES.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            editGuestNameSelect.appendChild(option);
        });
        
        editGuestNameSelect.addEventListener('change', function() {
            if (this.value) {
                editGuestNameInput.value = this.value;
            }
        });
        
        editGuestNameInput.addEventListener('input', function() {
            if (GUEST_NAMES.includes(this.value)) {
                editGuestNameSelect.value = this.value;
            } else if (this.value) {
                editGuestNameSelect.value = '';
            }
        });
    }
}

// Open edit booking modal
function openEditBookingModal(booking) {
    currentEditingBooking = booking;
    const editModal = document.getElementById('editBookingModal');
    const editGuestName = document.getElementById('editGuestName');
    const editGuestNameSelect = document.getElementById('editGuestNameSelect');
    const editRoomSelect = document.getElementById('editRoomSelect');
    const editStartDate = document.getElementById('editStartDate');
    const editEndDate = document.getElementById('editEndDate');
    const editBookingNotes = document.getElementById('editBookingNotes');
    
    if (!editModal || !booking) return;
    
    // Populate form fields
    if (editGuestName) editGuestName.value = booking.guestName || '';
    if (editGuestNameSelect) {
        editGuestNameSelect.value = GUEST_NAMES.includes(booking.guestName) ? booking.guestName : '';
    }
    if (editRoomSelect) editRoomSelect.value = booking.room || '';
    if (editStartDate) editStartDate.value = booking.startDate || '';
    if (editEndDate) editEndDate.value = booking.endDate || '';
    if (editBookingNotes) editBookingNotes.value = booking.notes || '';
    
    // Set minimum dates
    const today = new Date().toISOString().split('T')[0];
    if (editStartDate) editStartDate.min = today;
    if (editEndDate) editEndDate.min = today;
    
    editModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Update booking
async function updateBooking() {
    if (!currentEditingBooking) return;
    
    const updateButton = document.getElementById('updateBookingButton');
    const updateButtonText = document.getElementById('updateButtonText');
    const updateButtonLoading = document.getElementById('updateButtonLoading');
    const editModal = document.getElementById('editBookingModal');
    
    const formData = {
        bookingId: currentEditingBooking.id || currentEditingBooking.rowId,
        guestName: document.getElementById('editGuestName').value.trim(),
        room: document.getElementById('editRoomSelect').value,
        startDate: document.getElementById('editStartDate').value,
        endDate: document.getElementById('editEndDate').value,
        notes: document.getElementById('editBookingNotes').value.trim()
    };
    
    // Validate dates
    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
        showMessage('Check-out date must be after check-in date', 'error');
        return;
    }
    
    // Show loading state
    updateButton.disabled = true;
    updateButtonText.classList.add('hidden');
    updateButtonLoading.classList.remove('hidden');
    
    try {
        const formBody = new URLSearchParams();
        formBody.append('action', 'update');
        formBody.append('bookingId', formData.bookingId);
        formBody.append('guestName', formData.guestName);
        formBody.append('room', formData.room);
        formBody.append('startDate', formData.startDate);
        formBody.append('endDate', formData.endDate);
        formBody.append('notes', formData.notes);
        
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString()
        });
        
        if (response.ok) {
            const responseText = await response.text();
            const result = JSON.parse(responseText);
            
            if (result.success) {
                // Log activity
                logActivity('update', {
                    old: {
                        guestName: currentEditingBooking.guestName,
                        room: currentEditingBooking.room,
                        startDate: currentEditingBooking.startDate,
                        endDate: currentEditingBooking.endDate,
                        notes: currentEditingBooking.notes
                    },
                    new: formData
                }, formData.bookingId);
                
                showMessage('Booking successfully updated!', 'success');
                editModal.classList.add('hidden');
                document.body.style.overflow = '';
                currentEditingBooking = null;
                loadBookings();
            } else {
                // Close edit modal first so error message is visible
                editModal.classList.add('hidden');
                showMessage(result.message || 'Failed to update booking', 'error');
            }
        } else {
            showMessage('Error connecting to server', 'error');
        }
    } catch (error) {
        console.error('Error updating booking:', error);
        showMessage('Error updating booking. Please try again.', 'error');
    } finally {
        updateButton.disabled = false;
        updateButtonText.classList.remove('hidden');
        updateButtonLoading.classList.add('hidden');
    }
}

// Delete booking
async function deleteBooking() {
    if (!currentEditingBooking) return;
    
    const deleteButton = document.getElementById('deleteBookingButton');
    const editModal = document.getElementById('editBookingModal');
    
    if (!deleteButton) {
        console.error('Delete button not found');
        return;
    }
    
    const bookingId = currentEditingBooking.id || currentEditingBooking.rowId;
    if (!bookingId) {
        showMessage('Invalid booking ID', 'error');
        return;
    }
    
    const bookingData = {
        guestName: currentEditingBooking.guestName,
        room: currentEditingBooking.room,
        startDate: currentEditingBooking.startDate,
        endDate: currentEditingBooking.endDate,
        notes: currentEditingBooking.notes
    };
    
    // Store original button content
    const originalButtonText = deleteButton.textContent || 'Delete Booking';
    deleteButton.disabled = true;
    deleteButton.textContent = 'Deleting...';
    
    try {
        const formBody = new URLSearchParams();
        formBody.append('action', 'delete');
        formBody.append('bookingId', String(bookingId));
        
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString()
        });
        
        if (response.ok) {
            const responseText = await response.text();
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Error parsing delete response:', parseError);
                throw new Error('Invalid response from server');
            }
            
            if (result.success) {
                // Log activity
                logActivity('delete', bookingData, bookingId);
                
                showMessage('Booking successfully deleted!', 'success');
                if (editModal) {
                    editModal.classList.add('hidden');
                }
                document.body.style.overflow = '';
                currentEditingBooking = null;
                loadBookings();
            } else {
                showMessage(result.message || 'Failed to delete booking', 'error');
            }
        } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error('Delete request failed:', response.status, errorText);
            showMessage('Error connecting to server', 'error');
        }
    } catch (error) {
        console.error('Error deleting booking:', error);
        showMessage('Error deleting booking. Please try again.', 'error');
    } finally {
        // Always reset button state, even if there was an error
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.textContent = originalButtonText;
        }
    }
}

// Activity logging functions
function logActivity(action, data, bookingId) {
    const timestamp = new Date().toISOString();
    const userAgent = navigator.userAgent;
    const sessionId = sessionStorage.getItem('familyAccess') || 'unknown';
    
    // Try to get IP (won't work client-side, but structure is ready for backend)
    const activity = {
        id: Date.now(),
        timestamp: timestamp,
        action: action, // 'create', 'update', 'delete'
        bookingId: bookingId,
        data: data,
        sessionInfo: {
            sessionId: sessionId,
            userAgent: userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`
        }
    };
    
    activityLog.unshift(activity); // Add to beginning
    
    // Keep only last 1000 entries
    if (activityLog.length > 1000) {
        activityLog = activityLog.slice(0, 1000);
    }
    
    // Save to localStorage
    try {
        localStorage.setItem('bookingActivityLog', JSON.stringify(activityLog));
    } catch (e) {
        console.warn('Could not save activity log to localStorage:', e);
    }
    
    // Also try to send to API if available
    try {
        const formBody = new URLSearchParams();
        formBody.append('action', 'logActivity');
        formBody.append('activity', JSON.stringify(activity));
        
        fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString()
        }).catch(() => {
            // Silently fail if API is not available
        });
    } catch (e) {
        // Silently fail
    }
}

// Load activity log
function loadActivityLog() {
    try {
        const stored = localStorage.getItem('bookingActivityLog');
        if (stored) {
            activityLog = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Could not load activity log from localStorage:', e);
        activityLog = [];
    }
}

// Initialize activity log modal
function initializeActivityLogModal() {
    const activityLogModal = document.getElementById('activityLogModal');
    const closeActivityLogModal = document.getElementById('closeActivityLogModal');
    const viewActivityLogButton = document.getElementById('viewActivityLogButton');
    
    if (!activityLogModal) return;
    
    const closeModal = () => {
        activityLogModal.classList.add('hidden');
        document.body.style.overflow = '';
    };
    
    if (closeActivityLogModal) {
        closeActivityLogModal.addEventListener('click', closeModal);
    }
    
    if (viewActivityLogButton) {
        viewActivityLogButton.addEventListener('click', function() {
            renderActivityLog();
            activityLogModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        });
    }
    
    activityLogModal.addEventListener('click', function(e) {
        if (e.target === activityLogModal) {
            closeModal();
        }
    });
}

// Render activity log
function renderActivityLog() {
    const activityLogContent = document.getElementById('activityLogContent');
    if (!activityLogContent) return;
    
    if (activityLog.length === 0) {
        activityLogContent.innerHTML = '<p class="text-[#4a5568] text-center py-8">No activity recorded yet.</p>';
        return;
    }
    
    let html = '';
    activityLog.forEach(activity => {
        const date = new Date(activity.timestamp);
        const dateStr = date.toLocaleString();
        
        let actionText = '';
        let actionColor = '';
        let actionIcon = '';
        
        switch (activity.action) {
            case 'create':
                actionText = 'Created';
                actionColor = 'text-green-600 bg-green-50';
                actionIcon = '✓';
                break;
            case 'update':
                actionText = 'Updated';
                actionColor = 'text-blue-600 bg-blue-50';
                actionIcon = '✎';
                break;
            case 'delete':
                actionText = 'Deleted';
                actionColor = 'text-red-600 bg-red-50';
                actionIcon = '✕';
                break;
        }
        
        html += `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-start justify-between gap-4 mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${actionIcon}</span>
                        <span class="px-2 py-1 rounded text-xs font-medium ${actionColor}">${actionText}</span>
                    </div>
                    <span class="text-xs text-[#64748b]">${dateStr}</span>
                </div>
                <div class="text-sm text-[#475569] mt-2">
                    ${activity.action === 'update' ? 
                        `<div><strong>Old:</strong> ${escapeHtml(activity.data.old.guestName)} - ${escapeHtml(activity.data.old.room)} (${formatDateDisplay(activity.data.old.startDate)} to ${formatDateDisplay(activity.data.old.endDate)})</div>
                         <div class="mt-1"><strong>New:</strong> ${escapeHtml(activity.data.new.guestName)} - ${escapeHtml(activity.data.new.room)} (${formatDateDisplay(activity.data.new.startDate)} to ${formatDateDisplay(activity.data.new.endDate)})</div>` :
                        `<div><strong>Guest:</strong> ${escapeHtml(activity.data.guestName || 'N/A')}</div>
                         <div><strong>Room:</strong> ${escapeHtml(activity.data.room || 'N/A')}</div>
                         <div><strong>Dates:</strong> ${formatDateDisplay(activity.data.startDate || activity.data.old?.startDate)} to ${formatDateDisplay(activity.data.endDate || activity.data.old?.endDate)}</div>`
                    }
                    ${(activity.data.notes || activity.data.old?.notes) ? `<div class="mt-1 italic text-xs">Notes: ${escapeHtml(activity.data.notes || activity.data.old?.notes || '')}</div>` : ''}
                </div>
                <div class="text-xs text-[#94a3b8] mt-2 pt-2 border-t border-gray-100">
                    Session: ${escapeHtml(activity.sessionInfo.sessionId.substring(0, 8))}... | 
                    ${escapeHtml(activity.sessionInfo.platform)} | 
                    ${escapeHtml(activity.sessionInfo.language)}
                </div>
            </div>
        `;
    });
    
    activityLogContent.innerHTML = html;
}
