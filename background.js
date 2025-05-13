// Background script for Google Meet Next Meeting Timer

// Constants
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const ALARM_NAME = 'check-upcoming-meetings';
const CHECK_INTERVAL = 60; // Check for meetings every minute

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Meet Next Meeting Timer extension installed');
  
  // Set up periodic alarm to check for upcoming meetings
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  
  // Check authentication status
  checkAuthStatus();
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkUpcomingMeetings()
      .then(meetings => {
        if (meetings && meetings.length > 0) {
          notifyContentScriptAboutUpcomingMeetings(meetings);
        }
      })
      .catch(error => console.error('Error checking meetings:', error));
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.action === 'authenticate') {
    authenticate()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates async response
  }
  
  if (message.action === 'checkAuth') {
    checkAuthStatus()
      .then(status => sendResponse(status))
      .catch(error => sendResponse({ isAuthenticated: false, error: error.message }));
    return true; // Indicates async response
  }
  
  if (message.action === 'getUpcomingMeetings') {
    checkUpcomingMeetings()
      .then(meetings => sendResponse({ success: true, meetings }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates async response
  }
});

// Check if user is authenticated
async function checkAuthStatus() {
  try {
    const token = await getAuthToken();
    return { isAuthenticated: !!token };
  } catch (error) {
    console.error('Auth status check failed:', error);
    return { isAuthenticated: false, error: error.message };
  }
}

// Authenticate with Google
async function authenticate() {
  try {
    const token = await getAuthToken(true); // Force new token
    return { success: true, token };
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}

// Get auth token (cached or new)
async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

// Check for upcoming meetings
async function checkUpcomingMeetings() {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    // Get current time and time + 24 hours
    const now = new Date();
    const timeMin = now.toISOString();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const timeMax = tomorrow.toISOString();
    
    // Fetch calendar events
    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }
    
    const data = await response.json();
    const events = data.items || [];
    
    // Filter for Google Meet events
    const meetEvents = events.filter(event => 
      event.hangoutLink || 
      (event.conferenceData && event.conferenceData.conferenceId) ||
      (event.location && event.location.includes('meet.google.com'))
    );
    
    console.log('Upcoming Google Meet events:', meetEvents);
    
    // Store the upcoming meetings in storage for quick access
    chrome.storage.local.set({ 'upcomingMeetings': meetEvents });
    
    return meetEvents;
  } catch (error) {
    console.error('Error checking upcoming meetings:', error);
    throw error;
  }
}

// Notify content script about upcoming meetings
async function notifyContentScriptAboutUpcomingMeetings(meetings) {
  try {
    // Find Google Meet tabs
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
        resolve(tabs);
      });
    });
    
    if (tabs.length === 0) {
      console.log('No Google Meet tabs found to notify');
      return;
    }
    
    // Find the next meeting that's about to start (within 3 minutes)
    const now = new Date();
    const upcomingMeetings = meetings.filter(meeting => {
      const startTime = new Date(meeting.start.dateTime);
      const timeUntilMeeting = startTime - now;
      
      // Only notify about meetings starting within 3 minutes
      return timeUntilMeeting > 0 && timeUntilMeeting <= 3 * 60 * 1000;
    }).sort((a, b) => {
      return new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime();
    });
    
    if (upcomingMeetings.length === 0) {
      console.log('No meetings starting within 3 minutes');
      return;
    }
    
    const nextMeeting = upcomingMeetings[0];
    console.log('Notifying about upcoming meeting:', nextMeeting.summary);
    
    // Send message to all Google Meet tabs
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'upcomingMeeting',
        meeting: nextMeeting
      });
    });
  } catch (error) {
    console.error('Error notifying content script:', error);
  }
}