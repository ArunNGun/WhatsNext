// Content script for Google Meet Next Meeting Timer

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initialize);

// Initialize if document is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initialize();
}

// Global variables
let meetingPopups = {}; // Object to store multiple popups by meeting ID
let timerIntervals = {}; // Object to store timer intervals by meeting ID
let currentMeetings = {}; // Object to store current meetings by ID
let ignoredMeetings = new Set(); // Set to track ignored meeting IDs (in-memory only)
let pendingTimeouts = {}; // Object to track pending timeouts by meeting ID
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let activePopup = null; // Currently dragged popup

// Main initialization
function initialize() {
  console.log('Google Meet Next Meeting Timer content script initialized');
  
  // Check if we're in a Google Meet page
  if (window.location.hostname === 'meet.google.com') {
    console.log('On Google Meet page, setting up extension');
    
    // Set up listener for messages from background script
    chrome.runtime.onMessage.addListener(handleBackgroundMessages);
    
    // Check for upcoming meetings immediately
    checkUpcomingMeetings();
    
    // Set up periodic check for upcoming meetings (every 30 seconds)
    setInterval(checkUpcomingMeetings, 30000);
  }
}

// Handle messages from background script
function handleBackgroundMessages(message, sender, sendResponse) {
  console.log('Content script received message:', message);
  
  if (message.action === 'upcomingMeeting') {
    handleUpcomingMeeting(message.meeting);
  }
  
  // Always send a response to keep the message channel open
  if (sendResponse) {
    sendResponse({ received: true });
  }
  
  return true;
}

// Check for upcoming meetings
function checkUpcomingMeetings() {
  chrome.runtime.sendMessage({ action: 'getUpcomingMeetings' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error checking upcoming meetings:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.success && response.meetings && response.meetings.length > 0) {
      // Find upcoming meetings
      const now = new Date();
      
      // Track meetings that are within the display window (3 minutes)
      const displayMeetings = [];
      
      // Track meetings that are approaching but not yet in display window
      const approachingMeetings = [];
      
      // Process all meetings in the next 10 minutes
      response.meetings.forEach(meeting => {
        const startTime = new Date(meeting.start.dateTime);
        const timeUntilMeeting = startTime - now;
        
        // Only consider meetings starting within the next 10 minutes
        if (startTime > now && timeUntilMeeting <= 10 * 60 * 1000) {
          if (timeUntilMeeting <= 3 * 60 * 1000) {
            // Meeting is within 3 minutes - should be displayed
            displayMeetings.push(meeting);
          } else {
            // Meeting is approaching but not yet within 3 minutes
            approachingMeetings.push({
              meeting: meeting,
              timeUntil: timeUntilMeeting
            });
          }
        }
      });
      
      // Sort meetings by start time
      displayMeetings.sort((a, b) => {
        return new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime();
      });
      
      // Handle meetings that should be displayed now
      if (displayMeetings.length > 0) {
        // Handle each meeting that should be displayed
        displayMeetings.forEach(meeting => {
          handleUpcomingMeeting(meeting);
        });
        
        // Clean up any popups for meetings that are no longer upcoming
        cleanupOldMeetings(displayMeetings);
      } else {
        // No meetings to display right now, remove all popups
        removeAllPopups();
      }
      
      // Set timers for approaching meetings
      approachingMeetings.forEach(({ meeting, timeUntil }) => {
        // Skip if meeting is ignored
        if (ignoredMeetings.has(meeting.id)) {
          return;
        }
        
        // Clear any existing timeout for this meeting
        if (pendingTimeouts[meeting.id]) {
          clearTimeout(pendingTimeouts[meeting.id]);
        }
        
        // Calculate time until we need to show the popup (time until meeting minus 3 minutes)
        const timeUntilDisplay = timeUntil - (3 * 60 * 1000);
        
        // Set a timeout to show the popup when the meeting is 3 minutes away
        console.log(`Setting timeout for meeting "${meeting.summary}" in ${Math.floor(timeUntilDisplay/1000)} seconds`);
        pendingTimeouts[meeting.id] = setTimeout(() => {
          console.log(`Time to show popup for meeting: ${meeting.summary}`);
          // Remove from pending timeouts
          delete pendingTimeouts[meeting.id];
          // Show the popup
          handleUpcomingMeeting(meeting);
        }, timeUntilDisplay);
      });
    }
  });
}

// Clean up popups for meetings that are no longer upcoming
function cleanupOldMeetings(displayMeetings) {
  // Get IDs of meetings that should be displayed
  const displayIds = displayMeetings.map(meeting => meeting.id);
  
  // Find meetings in our tracking that should no longer be displayed
  Object.keys(currentMeetings).forEach(meetingId => {
    // If this meeting is not in the display list and not ignored
    if (!displayIds.includes(meetingId) && !ignoredMeetings.has(meetingId)) {
      // Check if the meeting has already started
      const meeting = currentMeetings[meetingId];
      const now = new Date();
      const startTime = new Date(meeting.start.dateTime);
      
      // If the meeting has started more than 5 minutes ago, remove it
      if (now - startTime > 5 * 60 * 1000) {
        removePopup(meetingId);
      }
      // Otherwise, keep the popup for meetings that have just started
    } else if (!displayIds.includes(meetingId) && ignoredMeetings.has(meetingId)) {
      // Always remove popups for ignored meetings
      removePopup(meetingId);
    }
  });
}

// Remove all popups
function removeAllPopups() {
  Object.keys(meetingPopups).forEach(meetingId => {
    removePopup(meetingId);
  });
}

// Handle upcoming meeting
function handleUpcomingMeeting(meeting) {
  if (!meeting.id) {
    console.error('Meeting has no ID, cannot handle it');
    return;
  }
  
  // Check if this meeting has been ignored
  if (ignoredMeetings.has(meeting.id)) {
    console.log('Meeting has been ignored, not showing popup for:', meeting.summary);
    return;
  }
  
  const now = new Date();
  const startTime = new Date(meeting.start.dateTime);
  const timeUntilMeeting = startTime - now;
  
  // Only show popup for meetings starting within 3 minutes
  if (timeUntilMeeting <= 3 * 60 * 1000) {
    // Check if we're already on the same meeting page
    if (isAlreadyOnMeetingPage(meeting)) {
      console.log('Already on the same meeting page, not showing popup for:', meeting.summary);
      return;
    }
    
    // If we already have a popup for this meeting, just update the timer
    if (currentMeetings[meeting.id]) {
      updateTimer(meeting.id, startTime);
      return;
    }
    
    // Otherwise, create a new popup
    currentMeetings[meeting.id] = meeting;
    createOrUpdatePopup(meeting);
    
    // Start the timer
    updateTimer(meeting.id, startTime);
    if (timerIntervals[meeting.id]) {
      clearInterval(timerIntervals[meeting.id]);
    }
    timerIntervals[meeting.id] = setInterval(() => updateTimer(meeting.id, startTime), 1000);
    
    // Clear any pending timeout for this meeting
    if (pendingTimeouts[meeting.id]) {
      clearTimeout(pendingTimeouts[meeting.id]);
      delete pendingTimeouts[meeting.id];
    }
  }
}

// Check if we're already on the same meeting page
function isAlreadyOnMeetingPage(meeting) {
  // Get current URL
  const currentUrl = window.location.href;
  
  // Extract meeting ID from current URL
  const currentMeetingId = extractMeetingId(currentUrl);
  
  // Get meeting URL from the meeting object
  let meetingUrl = '';
  if (meeting.hangoutLink) {
    meetingUrl = meeting.hangoutLink;
  } else if (meeting.conferenceData && meeting.conferenceData.conferenceId) {
    meetingUrl = `https://meet.google.com/${meeting.conferenceData.conferenceId}`;
  } else if (meeting.location && meeting.location.includes('meet.google.com')) {
    meetingUrl = meeting.location;
  }
  
  // Extract meeting ID from meeting URL
  const upcomingMeetingId = extractMeetingId(meetingUrl);
  
  // Compare the meeting IDs
  return currentMeetingId && upcomingMeetingId && currentMeetingId === upcomingMeetingId;
}

// Extract meeting ID from a Google Meet URL
function extractMeetingId(url) {
  if (!url) return null;
  
  // Try to match patterns like:
  // https://meet.google.com/abc-defg-hij
  // https://meet.google.com/lookup/abc-defg-hij
  const meetRegex = /meet\.google\.com\/(?:lookup\/)?([a-z0-9\-]+)/i;
  const match = url.match(meetRegex);
  
  return match ? match[1] : null;
}

// Create or update the meeting popup
function createOrUpdatePopup(meeting) {
  const meetingId = meeting.id;
  
  // If popup already exists, update it
  if (meetingPopups[meetingId]) {
    const titleElement = meetingPopups[meetingId].querySelector('.meeting-popup-title');
    if (titleElement) {
      titleElement.textContent = meeting.summary || 'Next Meeting';
    }
    return;
  }
  
  // Create popup container
  const popup = document.createElement('div');
  popup.className = 'meeting-popup';
  popup.id = `meeting-popup-${meetingId}`;
  popup.dataset.meetingId = meetingId;
  
  // Create popup header (for dragging)
  const popupHeader = document.createElement('div');
  popupHeader.className = 'meeting-popup-header';
  
  // Create popup title
  const popupTitle = document.createElement('div');
  popupTitle.className = 'meeting-popup-title';
  popupTitle.textContent = meeting.summary || 'Next Meeting';
  
  // Create timer element
  const timerElement = document.createElement('div');
  timerElement.className = 'meeting-popup-timer';
  timerElement.id = `meeting-timer-${meetingId}`;
  timerElement.textContent = '00:00';
  
  // Create buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'meeting-popup-buttons';
  
  // Create join button
  const joinButton = document.createElement('button');
  joinButton.className = 'meeting-popup-join-button';
  joinButton.textContent = 'Join';
  joinButton.addEventListener('click', () => {
    let meetingUrl = '';
    
    if (meeting.hangoutLink) {
      meetingUrl = meeting.hangoutLink;
    } else if (meeting.conferenceData && meeting.conferenceData.conferenceId) {
      meetingUrl = `https://meet.google.com/${meeting.conferenceData.conferenceId}`;
    } else if (meeting.location && meeting.location.includes('meet.google.com')) {
      meetingUrl = meeting.location;
    }
    
    if (meetingUrl) {
      window.open(meetingUrl, '_blank');
    }
  });
  
  // Create ignore button
  const ignoreButton = document.createElement('button');
  ignoreButton.className = 'meeting-popup-ignore-button';
  ignoreButton.textContent = 'Ignore';
  ignoreButton.addEventListener('click', () => {
    // Add meeting ID to ignored meetings set
    ignoredMeetings.add(meeting.id);
    
    // Remove the popup
    removePopup(meeting.id);
    
    console.log('Ignored meeting:', meeting.summary);
  });
  
  // Add buttons to container
  buttonsContainer.appendChild(joinButton);
  buttonsContainer.appendChild(ignoreButton);
  
  // Add elements to popup
  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(timerElement); // Move timer to header
  popup.appendChild(popupHeader);
  popup.appendChild(buttonsContainer);
  
  // Add dragging functionality
  popupHeader.addEventListener('mousedown', (e) => startDragging(e, popup));
  
  // Add popup to page
  document.body.appendChild(popup);
  
  // Store the popup reference
  meetingPopups[meetingId] = popup;
  
  // Position popups in a cascading manner
  positionPopup(popup, Object.keys(meetingPopups).length - 1);
}

// Position popup in a cascading manner
function positionPopup(popup, index) {
  // Start from bottom right and cascade upward
  const baseRight = 16;
  const baseBottom = 16;
  const offsetPerPopup = 30; // Offset each popup by this amount
  
  // Reset any left/top positioning that might have been set
  popup.style.left = 'auto';
  popup.style.top = 'auto';
  
  // Apply right/bottom positioning
  popup.style.right = `${baseRight}px`;
  popup.style.bottom = `${baseBottom + (index * offsetPerPopup)}px`;
  
  // Ensure the popup maintains its correct size
  popup.style.height = 'auto';
  popup.style.width = '140px'; // Match the width from CSS
}

// Update the timer display
function updateTimer(meetingId, startTime) {
  const popup = meetingPopups[meetingId];
  if (!popup) return;
  
  const now = new Date();
  const timeUntilMeeting = startTime - now;
  
  // If meeting has started, remove popup after a short delay
  if (timeUntilMeeting <= 0) {
    const joinButton = popup.querySelector('.meeting-popup-join-button');
    if (joinButton) {
      joinButton.classList.add('glow');
    }
    
    const timerElement = popup.querySelector(`#meeting-timer-${meetingId}`);
    if (timerElement) {
      timerElement.textContent = 'Now!';
      timerElement.classList.add('time-up');
    }
    
    // Remove popup 5 minutes after meeting start
    if (timeUntilMeeting < -5 * 60 * 1000) {
      removePopup(meetingId);
    }
    
    return;
  }
  
  // Format time remaining
  const minutes = Math.floor(timeUntilMeeting / 60000);
  const seconds = Math.floor((timeUntilMeeting % 60000) / 1000);
  
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const timerElement = popup.querySelector(`#meeting-timer-${meetingId}`);
  if (timerElement) {
    timerElement.textContent = formattedTime;
  }
  
  // If less than 10 seconds, add urgency class
  if (timeUntilMeeting < 10000) {
    timerElement.classList.add('urgent');
  } else {
    timerElement.classList.remove('urgent');
  }
}

// Remove the popup
function removePopup(meetingId) {
  const popup = meetingPopups[meetingId];
  if (popup && popup.parentNode) {
    popup.parentNode.removeChild(popup);
    delete meetingPopups[meetingId];
  }
  
  if (timerIntervals[meetingId]) {
    clearInterval(timerIntervals[meetingId]);
    delete timerIntervals[meetingId];
  }
  
  if (pendingTimeouts[meetingId]) {
    clearTimeout(pendingTimeouts[meetingId]);
    delete pendingTimeouts[meetingId];
  }
  
  if (currentMeetings[meetingId]) {
    delete currentMeetings[meetingId];
  }
  
  // Reposition remaining popups
  repositionPopups();
}

// Reposition all popups after one is removed
function repositionPopups() {
  const popupIds = Object.keys(meetingPopups);
  popupIds.forEach((id, index) => {
    const popup = meetingPopups[id];
    
    // Only reposition if the popup is using the default positioning (right/bottom)
    // Don't reposition popups that have been manually dragged (using left/top)
    if (popup.style.left === 'auto' || popup.style.top === 'auto') {
      positionPopup(popup, index);
    }
  });
}

// Start dragging the popup
function startDragging(e, popup) {
  isDragging = true;
  activePopup = popup;
  
  // Calculate the offset of the mouse pointer from the popup's top-left corner
  const rect = popup.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  // Prevent text selection during drag
  e.preventDefault();
  
  // Add mousemove and mouseup listeners
  document.addEventListener('mousemove', dragPopup);
  document.addEventListener('mouseup', stopDragging);
}

// Drag the popup
function dragPopup(e) {
  if (!isDragging || !activePopup) return;
  
  // Calculate new position
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  
  // Apply new position
  activePopup.style.left = `${x}px`;
  activePopup.style.top = `${y}px`;
  
  // Remove right/bottom positioning if we're using left/top
  activePopup.style.right = 'auto';
  activePopup.style.bottom = 'auto';
}

// Stop dragging
function stopDragging() {
  isDragging = false;
  activePopup = null;
  
  // Remove event listeners
  document.removeEventListener('mousemove', dragPopup);
  document.removeEventListener('mouseup', stopDragging);
}
