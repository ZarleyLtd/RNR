// API helpers (Supabase Edge Function rnr-api)
function getApiUrl() {
    const url = window.RNR_CONFIG && window.RNR_CONFIG.API_URL;
    if (!url) {
        throw new Error('API_URL is not configured in assets/js/config.js');
    }
    return url.replace(/\/$/, '');
}

function unwrapApiResponse(res) {
    if (!res) throw new Error('Empty response');
    if (res.error) throw new Error(res.error);
    return res.data;
}

async function apiGet(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params });
    const response = await fetch(`${getApiUrl()}?${qs}`);
    const json = await response.json();
    return unwrapApiResponse(json);
}

async function apiPost(action, body = {}) {
    const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action, ...body })
    });
    const json = await response.json();
    return unwrapApiResponse(json);
}

function getAuthPassword() {
    return sessionStorage.getItem('rnrAuth') || '';
}

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
    initializePasswordCheck();
    initializeBookingModal();
    initializeCalendar();
    initializeMessageToast();
    initializeGuestNameSelect();
    initializeRoomToggles();
    initializeProceedButton();
    initializePinVerificationModal();
    initializeEditBookingModal();
    initializeActivityLogModal();
    initializeDeleteConfirmModal();
    loadBookings();
    loadActivityLog();
    updateActivityLogButtonVisibility();
});

// Password Check
function initializePasswordCheck() {
    const passwordOverlay = document.getElementById('passwordOverlay');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmit = document.getElementById('passwordSubmit');
    const passwordError = document.getElementById('passwordError');
    const mainContent = document.getElementById('mainContent');
    
    // Restore session if role was stored from a previous login this session
    const storedRole = sessionStorage.getItem('rnrRole');
    const storedAuth = sessionStorage.getItem('rnrAuth');
    if (storedRole && storedAuth) {
        passwordOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        updateActivityLogButtonVisibility();
        if (storedRole === 'admin') {
            fetchActivityLogFromServer();
        }
        return;
    }
    
    passwordSubmit.addEventListener('click', async function() {
        const inputPassword = passwordInput.value.trim();
        passwordSubmit.disabled = true;
        
        try {
            const data = await apiPost('verifyPassword', { password: inputPassword });
            sessionStorage.setItem('rnrRole', data.role);
            sessionStorage.setItem('rnrAuth', inputPassword);
            passwordOverlay.classList.add('hidden');
            mainContent.classList.remove('hidden');
            passwordError.classList.add('hidden');
            updateActivityLogButtonVisibility();
            if (data.role === 'admin') {
                await fetchActivityLogFromServer();
            }
        } catch (error) {
            passwordError.classList.remove('hidden');
            passwordInput.value = '';
            passwordInput.focus();
        } finally {
            passwordSubmit.disabled = false;
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
    return sessionStorage.getItem('rnrRole') === 'admin';
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
    // Parse date string without timezone conversion
    const date = parseDateString(dateStr);
    if (!date) {
        // Fallback for invalid dates
        return { status: 'available', availableRooms: ROOMS.map(r => r.id), bookedRooms: [], entireHouseBooked: false };
    }
    
    const availableRooms = [];
    const bookedRooms = [];
    let entireHouseBooked = false;
    
    // Check for entire house bookings first
    entireHouseBooked = bookings.some(booking => {
        if (booking.room !== 'Entire House') return false;
        const bookingStart = parseDateString(booking.startDate);
        const bookingEnd = parseDateString(booking.endDate);
        if (!bookingStart || !bookingEnd) return false;
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
            const bookingRoom = booking.room || '';
            // Check if booking room matches this room, or if it's a comma-separated list containing this room
            const roomMatches = bookingRoom === room.id || 
                               bookingRoom === 'Entire House' ||
                               (bookingRoom.includes(',') && bookingRoom.split(',').map(r => r.trim()).includes(room.id));
            if (!roomMatches) return false;
            const bookingStart = parseDateString(booking.startDate);
            const bookingEnd = parseDateString(booking.endDate);
            if (!bookingStart || !bookingEnd) return false;
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


// Helper function to parse date string (YYYY-MM-DD) without timezone conversion
function parseDateString(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
}

// Helper function to format date as YYYY-MM-DD using local date components (not UTC)
function formatDateString(date) {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        const data = await apiGet('getBookings');
        bookings = Array.isArray(data) ? data : [];
        renderCalendar();
        renderBookingsList();
        if (selectedCheckin || selectedCheckout) {
            updateCalendarSelection();
            updateProceedButton();
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

// Initialize guest name autocomplete
function initializeGuestNameSelect() {
    const guestNameInput = document.getElementById('guestName');
    const guestNameList = document.getElementById('guestNameList');
    const editGuestNameInput = document.getElementById('editGuestName');
    const editGuestNameList = document.getElementById('editGuestNameList');
    
    // Populate datalist for new booking
    if (guestNameList) {
        GUEST_NAMES.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            guestNameList.appendChild(option);
        });
    }
    
    // Populate datalist for edit booking
    if (editGuestNameList) {
        GUEST_NAMES.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            editGuestNameList.appendChild(option);
        });
    }
}

// Initialize room toggles
function initializeRoomToggles() {
    // New booking room toggles
    const roomToggles = document.querySelectorAll('.room-toggle');
    roomToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            this.classList.toggle('active');
            updateRoomSelection();
        });
    });
    
    // Edit booking room toggles
    const editRoomToggles = document.querySelectorAll('.edit-room-toggle');
    editRoomToggles.forEach(toggle => {
        toggle.addEventListener('click', function() {
            this.classList.toggle('active');
            updateEditRoomSelection();
        });
    });
}

// Update room selection for new booking
function updateRoomSelection() {
    const selectedRooms = [];
    document.querySelectorAll('.room-toggle.active').forEach(toggle => {
        selectedRooms.push(toggle.getAttribute('data-room'));
    });
    
    const roomSelect = document.getElementById('roomSelect');
    if (!roomSelect) return;
    
    // If all 3 rooms selected, set as "Entire House"
    if (selectedRooms.length === 3) {
        roomSelect.value = 'Entire House';
    } else if (selectedRooms.length > 0) {
        // For now, we'll store as comma-separated, but backend will need to handle this
        // Actually, let's store as "Entire House" if all 3, otherwise as comma-separated
        roomSelect.value = selectedRooms.join(',');
    } else {
        roomSelect.value = '';
    }
}

// Update room selection for edit booking
function updateEditRoomSelection() {
    const selectedRooms = [];
    document.querySelectorAll('.edit-room-toggle.active').forEach(toggle => {
        selectedRooms.push(toggle.getAttribute('data-room'));
    });
    
    const roomSelect = document.getElementById('editRoomSelect');
    if (!roomSelect) return;
    
    // If all 3 rooms selected, set as "Entire House"
    if (selectedRooms.length === 3) {
        roomSelect.value = 'Entire House';
    } else if (selectedRooms.length > 0) {
        roomSelect.value = selectedRooms.join(',');
    } else {
        roomSelect.value = '';
    }
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
        // Reset room toggles
        document.querySelectorAll('.room-toggle').forEach(toggle => {
            toggle.classList.remove('active');
        });
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
            // Reset room toggles
            document.querySelectorAll('.room-toggle').forEach(toggle => {
                toggle.classList.remove('active');
            });
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
        
        // Get selected rooms
        const selectedRooms = [];
        document.querySelectorAll('.room-toggle.active').forEach(toggle => {
            selectedRooms.push(toggle.getAttribute('data-room'));
        });
        
        // Validate at least one room is selected
        if (selectedRooms.length === 0) {
            showMessage('Please select at least one room', 'error');
            return;
        }
        
        // Determine room value: "Entire House" if all 3, otherwise comma-separated
        let roomValue;
        if (selectedRooms.length === 3) {
            roomValue = 'Entire House';
        } else {
            roomValue = selectedRooms.join(',');
        }
        
        const formData = {
            guestName: document.getElementById('guestName').value.trim(),
            room: roomValue,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            notes: document.getElementById('bookingNotes').value.trim(),
            pin: normalizePin(document.getElementById('bookingPin').value) // Normalize PIN when creating (can be empty)
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
        
        try {
            const result = await apiPost('createBooking', {
                authPassword: getAuthPassword(),
                guestName: formData.guestName,
                room: formData.room,
                startDate: formData.startDate,
                endDate: formData.endDate,
                notes: formData.notes,
                pin: formData.pin
            });
            
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
            selectedCheckin = null;
            selectedCheckout = null;
            updateCalendarSelection();
            updateProceedButton();
            const dateSelectionPanel = document.getElementById('dateSelectionPanel');
            if (dateSelectionPanel) {
                dateSelectionPanel.classList.add('hidden');
            }
            loadBookings();
        } catch (error) {
            console.error('Error submitting booking:', error);
            let errorMsg = error.message || 'Error submitting booking. Please try again.';
            if (error.message === 'Failed to fetch') {
                errorMsg = 'Network error: Could not connect to server. Please check your internet connection.';
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
        const dateStr = formatDateString(current);
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
        const dateStr = formatDateString(current);
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
    // Parse date string without timezone conversion and normalize to midnight
    const date = parseDateString(dateStr);
    if (!date) return;
    // Ensure date is normalized to local midnight for consistent comparisons
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Check if this date is fully booked
    const availability = getDateAvailability(dateStr);
    const isFullyBooked = availability.status === 'booked';
    
    // If no checkin selected, or if clicking a date before/equal to current checkin, set as checkin
    if (!selectedCheckin || normalizedDate <= selectedCheckin) {
        // Don't allow selecting a fully booked date as check-in
        if (isFullyBooked) {
            showMessage('Cannot select a fully booked date as check-in date.', 'error');
            return;
        }
        selectedCheckin = normalizedDate;
        selectedCheckout = null;
    } else if (!selectedCheckout) {
        // If checkin is selected, set as checkout (must be after checkin)
        // Checkout date can be fully booked since that's the departure day
        if (normalizedDate > selectedCheckin) {
            // Check if the date range is available (no fully booked dates in between)
            // Note: checkout date itself can be fully booked
            if (isDateRangeAvailable(selectedCheckin, normalizedDate)) {
                selectedCheckout = normalizedDate;
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
        selectedCheckin = normalizedDate;
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
    
    const checkinStr = formatDateString(selectedCheckin);
    const checkoutStr = selectedCheckout ? formatDateString(selectedCheckout) : null;
    
    calendarContainer.querySelectorAll('.calendar-day:not(.empty)').forEach(cell => {
        const cellDateStr = cell.getAttribute('data-date');
        if (!cellDateStr) return;
        
        // Parse date string without timezone conversion
        const cellDate = parseDateString(cellDateStr);
        if (!cellDate) return;
        
        // Normalize dates to midnight for accurate comparison
        const normalizedCellDate = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
        const normalizedCheckin = new Date(selectedCheckin.getFullYear(), selectedCheckin.getMonth(), selectedCheckin.getDate());
        const normalizedCheckout = selectedCheckout ? new Date(selectedCheckout.getFullYear(), selectedCheckout.getMonth(), selectedCheckout.getDate()) : null;
        
        const isCheckin = cellDateStr === checkinStr;
        const isCheckout = checkoutStr && cellDateStr === checkoutStr;
        const isInRange = checkoutStr && normalizedCellDate > normalizedCheckin && normalizedCellDate < normalizedCheckout;
        
        if (isCheckin) {
            cell.classList.add('selected', 'selected-start');
        } else if (isCheckout) {
            cell.classList.add('selected', 'selected-end');
        } else if (isInRange) {
            cell.classList.add('selected-range');
        } else {
            // Remove any selection classes if this cell shouldn't be highlighted
            cell.classList.remove('selected', 'selected-range', 'selected-start', 'selected-end');
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
    const guestNameInput = document.getElementById('guestName');
    
    // Set hidden date inputs for form submission
    const checkinStr = formatDateString(selectedCheckin);
    const checkoutStr = formatDateString(selectedCheckout);
    startDateInput.value = checkinStr;
    endDateInput.value = checkoutStr;
    
    // Display formatted dates
    if (checkinDateDisplay) {
        checkinDateDisplay.textContent = formatDateDisplay(selectedCheckin);
    }
    if (checkoutDateDisplay) {
        checkoutDateDisplay.textContent = formatDateDisplay(selectedCheckout);
    }
    
    // Reset room toggles
    document.querySelectorAll('.room-toggle').forEach(toggle => {
        toggle.classList.remove('active');
        // Check if room is available for the selected date range
        const roomId = toggle.getAttribute('data-room');
        const availableRooms = getAvailableRoomsForDateRange(selectedCheckin, selectedCheckout);
        // Enable/disable based on availability
        if (availableRooms.includes(roomId) || availableRooms.includes('Entire House')) {
            toggle.disabled = false;
            toggle.style.opacity = '1';
        } else {
            toggle.disabled = true;
            toggle.style.opacity = '0.5';
        }
    });
    
    // Reset guest name field
    if (guestNameInput) guestNameInput.value = '';
    
    bookingModal.classList.remove('hidden');
    
    // Prevent body scroll on mobile when modal is open
    if (window.innerWidth <= 768) {
        document.body.style.overflow = 'hidden';
    }
    
    // Small delay for focus on mobile
    setTimeout(() => {
        if (guestNameInput) {
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
    
    // Format dates for display in compact format
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    function formatBookingDateRange(startDateStr, endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        const startMonth = startDate.getMonth();
        const startDay = startDate.getDate();
        const startYear = startDate.getFullYear();
        const startDayName = dayNames[startDate.getDay()];
        
        const endMonth = endDate.getMonth();
        const endDay = endDate.getDate();
        const endYear = endDate.getFullYear();
        const endDayName = dayNames[endDate.getDay()];
        
        // Check if months are different
        const monthsDifferent = startMonth !== endMonth;
        // Check if years are different
        const yearsDifferent = startYear !== endYear;
        
        let dateStr = '';
        
        // Start date: always show month and day
        dateStr += monthNames[startMonth] + ' ' + startDay;
        
        // Add year to start date only if years are different
        if (yearsDifferent) {
            dateStr += ', ' + startYear;
        }
        
        dateStr += ' - ';
        
        // End date: show month only if different from start month
        if (monthsDifferent) {
            dateStr += monthNames[endMonth] + ' ';
        }
        
        dateStr += endDay;
        
        // Add year: if years are the same, show once at the end; if different, show on end date too
        if (yearsDifferent) {
            dateStr += ', ' + endYear;
        } else {
            // Same year: show once at the end
            dateStr += ', ' + endYear;
        }
        
        // Add day names in parentheses
        dateStr += ' (' + startDayName + ' - ' + endDayName + ')';
        
        return dateStr;
    }
    
    let html = '';
    upcomingBookings.forEach(booking => {
        const roomIcon = getRoomIcon(booking.room);
        const bookingId = booking.id || booking.rowId || JSON.stringify(booking);
        html += `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer booking-item" data-booking-id="${escapeHtml(bookingId)}">
                <div class="flex items-start gap-3">
                    <span class="text-2xl flex-shrink-0">${roomIcon}</span>
                    <div class="flex-1">
                        <div class="font-semibold text-[#1e293b] mb-1">${escapeHtml(booking.guestName)}</div>
                        <div class="text-sm text-[#475569]">
                            <span class="font-medium">${booking.room}</span> • 
                            ${formatBookingDateRange(booking.startDate, booking.endDate)}
                        </div>
                        ${booking.notes ? `<div class="text-xs text-[#64748b] mt-1 italic">${escapeHtml(booking.notes)}</div>` : ''}
                    </div>
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
    
    // Skip PIN verification if booking has no PIN
    const bookingPin = normalizePin(booking.pin || '');
    if (bookingPin === '') {
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
    
    // If booking has no PIN, skip verification
    const bookingPin = normalizePin(currentEditingBooking.pin || '');
    if (bookingPin === '') {
        pinModal.classList.add('hidden');
        document.body.style.overflow = '';
        openEditBookingModal(currentEditingBooking);
        return;
    }
    
    // Normalize both PINs: handle all whitespace characters and sequences
    const enteredPin = normalizePin(pinInput.value);
    
    // Compare normalized PINs
    if (enteredPin === bookingPin) {
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
        // Reset room toggles
        document.querySelectorAll('.edit-room-toggle').forEach(toggle => {
            toggle.classList.remove('active');
        });
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
            showDeleteConfirmModal();
        });
    }
    
    editModal.addEventListener('click', function(e) {
        if (e.target === editModal) {
            closeModal();
        }
    });
    
}

// Open edit booking modal
function openEditBookingModal(booking) {
    currentEditingBooking = booking;
    const editModal = document.getElementById('editBookingModal');
    const editGuestName = document.getElementById('editGuestName');
    const editRoomSelect = document.getElementById('editRoomSelect');
    const editStartDate = document.getElementById('editStartDate');
    const editEndDate = document.getElementById('editEndDate');
    const editBookingNotes = document.getElementById('editBookingNotes');
    
    if (!editModal || !booking) return;
    
    // Populate form fields
    if (editGuestName) editGuestName.value = booking.guestName || '';
    
    // Handle room selection - parse room value and set toggles
    const roomValue = booking.room || '';
    if (roomValue === 'Entire House') {
        // All 3 rooms selected
        document.querySelectorAll('.edit-room-toggle').forEach(toggle => {
            toggle.classList.add('active');
        });
        if (editRoomSelect) editRoomSelect.value = 'Entire House';
    } else if (roomValue.includes(',')) {
        // Multiple rooms (comma-separated)
        const rooms = roomValue.split(',').map(r => r.trim());
        document.querySelectorAll('.edit-room-toggle').forEach(toggle => {
            const roomId = toggle.getAttribute('data-room');
            if (rooms.includes(roomId)) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        });
        if (editRoomSelect) editRoomSelect.value = roomValue;
    } else {
        // Single room
        document.querySelectorAll('.edit-room-toggle').forEach(toggle => {
            toggle.classList.remove('active');
            const roomId = toggle.getAttribute('data-room');
            if (roomId === roomValue) {
                toggle.classList.add('active');
            }
        });
        if (editRoomSelect) editRoomSelect.value = roomValue;
    }
    
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
    
    // Get selected rooms
    const selectedRooms = [];
    document.querySelectorAll('.edit-room-toggle.active').forEach(toggle => {
        selectedRooms.push(toggle.getAttribute('data-room'));
    });
    
    // Validate at least one room is selected
    if (selectedRooms.length === 0) {
        showMessage('Please select at least one room', 'error');
        return;
    }
    
    // Determine room value: "Entire House" if all 3, otherwise comma-separated
    let roomValue;
    if (selectedRooms.length === 3) {
        roomValue = 'Entire House';
    } else {
        roomValue = selectedRooms.join(',');
    }
    
    const formData = {
        bookingId: currentEditingBooking.id || currentEditingBooking.rowId,
        guestName: document.getElementById('editGuestName').value.trim(),
        room: roomValue,
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
        await apiPost('updateBooking', {
            authPassword: getAuthPassword(),
            bookingId: formData.bookingId,
            guestName: formData.guestName,
            room: formData.room,
            startDate: formData.startDate,
            endDate: formData.endDate,
            notes: formData.notes
        });
        
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
    } catch (error) {
        console.error('Error updating booking:', error);
        editModal.classList.add('hidden');
        showMessage(error.message || 'Error updating booking. Please try again.', 'error');
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
        await apiPost('deleteBooking', {
            authPassword: getAuthPassword(),
            bookingId: String(bookingId)
        });
        
        logActivity('delete', bookingData, bookingId);
        
        showMessage('Booking successfully deleted!', 'success');
        if (editModal) {
            editModal.classList.add('hidden');
        }
        document.body.style.overflow = '';
        currentEditingBooking = null;
        loadBookings();
    } catch (error) {
        console.error('Error deleting booking:', error);
        showMessage(error.message || 'Error deleting booking. Please try again.', 'error');
    } finally {
        // Always reset button state, even if there was an error
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.textContent = originalButtonText;
        }
    }
}

// Activity logging functions
function buildActivityEntry(action, data, bookingId) {
    const timestamp = new Date().toISOString();
    return {
        id: Date.now(),
        timestamp: timestamp,
        action: action,
        bookingId: bookingId,
        data: data,
        sessionInfo: {
            sessionId: (sessionStorage.getItem('rnrAuth') || 'unknown').substring(0, 8),
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${window.screen.width}x${window.screen.height}`
        }
    };
}

function cacheActivityLogLocally() {
    try {
        localStorage.setItem('bookingActivityLog', JSON.stringify(activityLog));
    } catch (e) {
        console.warn('Could not save activity log to localStorage:', e);
    }
}

function logActivity(action, data, bookingId) {
    const activity = buildActivityEntry(action, data, bookingId);
    
    activityLog.unshift(activity);
    if (activityLog.length > 1000) {
        activityLog = activityLog.slice(0, 1000);
    }
    cacheActivityLogLocally();
    
    apiPost('logActivity', {
        authPassword: getAuthPassword(),
        activity: activity
    }).catch(() => {
        // Silently fail if API is not available
    });
}

// Load activity log from localStorage (fallback cache)
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

// Fetch activity log from Supabase (primary source for admins)
async function fetchActivityLogFromServer() {
    if (!isAdmin()) return;
    try {
        const data = await apiPost('getActivityLog', {
            authPassword: getAuthPassword()
        });
        if (Array.isArray(data) && data.length > 0) {
            activityLog = data;
            cacheActivityLogLocally();
        }
    } catch (e) {
        console.warn('Could not load activity log from server:', e);
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
        viewActivityLogButton.addEventListener('click', async function() {
            await fetchActivityLogFromServer();
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

// Initialize delete confirmation modal
function initializeDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const cancelDeleteButton = document.getElementById('cancelDeleteButton');
    const confirmDeleteButton = document.getElementById('confirmDeleteButton');
    
    if (!deleteConfirmModal) {
        console.warn('Delete confirmation modal not found');
        return;
    }
    
    const closeModal = () => {
        deleteConfirmModal.classList.add('hidden');
        document.body.style.overflow = '';
    };
    
    if (cancelDeleteButton) {
        cancelDeleteButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });
    } else {
        console.warn('Cancel delete button not found');
    }
    
    if (confirmDeleteButton) {
        confirmDeleteButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
            deleteBooking();
        });
    } else {
        console.warn('Confirm delete button not found');
    }
    
    deleteConfirmModal.addEventListener('click', function(e) {
        if (e.target === deleteConfirmModal) {
            closeModal();
        }
    });
    
    // Prevent clicks inside modal content from closing the modal
    const modalContent = deleteConfirmModal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
}

// Show delete confirmation modal
function showDeleteConfirmModal() {
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    if (!deleteConfirmModal) return;
    
    deleteConfirmModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
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
                    Session: ${escapeHtml(String(activity.sessionInfo?.sessionId || 'unknown').substring(0, 8))}... | 
                    ${escapeHtml(activity.sessionInfo.platform)} | 
                    ${escapeHtml(activity.sessionInfo.language)}
                </div>
            </div>
        `;
    });
    
    activityLogContent.innerHTML = html;
}
