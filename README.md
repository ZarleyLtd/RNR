# Holiday Home Booking System

A zero-cost booking system for a holiday home, built with a static frontend (deployable on GitHub Pages) and Google Apps Script backend.

## Features

- **Resource Timeline Calendar View**: Shows 3 rooms (Master, Twin, Bunk) on the Y-axis with dates on the X-axis
- **Booking Management**: Create new bookings with guest name and dates
- **Family Password Protection**: Simple overlay authentication before accessing the calendar
- **Boutique Hotel Design**: Clean, elegant aesthetic with soft creams and slate grays
- **Zero Cost**: Frontend on GitHub Pages, backend on Google Apps Script (both free)

## Setup Instructions

### Frontend Setup

1. The frontend files (`index.html` and `app.js`) are ready to use
2. Update the `API_URL` constant in `app.js` with your Google Apps Script Web App URL (see Backend Setup)
3. Update the `FAMILY_PASSWORD` constant in `app.js` to your desired password
4. Deploy to GitHub Pages or any static hosting service

### Backend Setup (Google Apps Script)

1. **Create a Google Sheet**:
   - Create a new Google Sheet
   - The script will automatically create a "Bookings" tab with headers if it doesn't exist

2. **Create the Script**:
   - In your Google Sheet, go to `Extensions` → `Apps Script`
   - Delete any default code
   - Copy and paste the contents of `backend/code.gs`
   - Save the project (give it a name like "Holiday Booking")

3. **Deploy as Web App**:
   - Click `Deploy` → `New deployment`
   - Click the gear icon ⚙️ next to "Select type" and choose "Web app"
   - Set the following:
     - **Description**: "Holiday Booking API" (or any description)
     - **Execute as**: "Me"
     - **Who has access**: "Anyone" (or "Anyone with Google account" for more security)
   - Click "Deploy"
   - Copy the Web App URL that appears
   - Click "Done"

4. **Update Frontend**:
   - Open `app.js`
   - Replace `YOUR_SCRIPT_ID` in the `API_URL` constant with your actual Web App URL

5. **Authorize the Script** (First time only):
   - When you first access the Web App URL, Google will ask for authorization
   - Click "Review Permissions" → Choose your Google account → "Advanced" → "Go to [Project Name] (unsafe)" → "Allow"

## Usage

1. Access the booking system through your deployed frontend URL
2. Enter the family password when prompted
3. Click on any date in the calendar to create a new booking
4. Fill in the booking form:
   - Guest Name
   - Room (Master, Twin, or Bunk)
   - Check-in Date
   - Check-out Date
5. Submit the booking

## Technical Details

- **Frontend**: HTML, JavaScript, Tailwind CSS (via CDN), FullCalendar.io
- **Backend**: Google Apps Script
- **Data Storage**: Google Sheets
- **Date Format**: ISO 8601 (YYYY-MM-DD) for consistency
- **Security**: Family password stored in frontend (basic protection)

## Files

- `index.html` - Main HTML file with calendar and booking modal
- `app.js` - Frontend JavaScript logic
- `backend/code.gs` - Google Apps Script backend code

## Notes

- The booking system includes basic conflict detection to prevent double-booking
- All dates are handled in ISO 8601 format to avoid timezone issues
- The calendar view supports month, week, and day views
- Bookings are stored in Google Sheets and can be managed directly there if needed

webapp url:
https://script.google.com/macros/s/AKfycbyenccYwHjyj6bRS3QWjq_0Ve_rVOTEwIb6xCm-pYPWorb0JxsJxqoDfsXpioqNvtOb/exec

deployment ID
AKfycbyenccYwHjyj6bRS3QWjq_0Ve_rVOTEwIb6xCm-pYPWorb0JxsJxqoDfsXpioqNvtOb