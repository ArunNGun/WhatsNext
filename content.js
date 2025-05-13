// Content script for Google Meet Next Meeting Timer

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initialize);

// Initialize if document is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initialize();
}

// Global variables
let meetingPopup = null;
let timerInterval = null;
let currentMeeting = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;

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
      // Find the next meeting
      const now = new Date();
      const nextMeetings = response.meetings
        .filter(meeting => {
          const startTime = new Date(meeting.start.dateTime);
          // Only consider meetings starting within the next 10 minutes
          return startTime > now && (startTime - now) <= 10 * 60 * 1000;
        })
        .sort((a, b) => {
          return new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime();
        });
      
      if (nextMeetings.length > 0) {
        handleUpcomingMeeting(nextMeetings[0]);
      } else if (meetingPopup && !currentMeeting) {
        // No upcoming meetings in the next 10 minutes, remove popup if it exists
        removePopup();
      }
    }
  });
}

// Handle upcoming meeting
function handleUpcomingMeeting(meeting) {
  const now = new Date();
  const startTime = new Date(meeting.start.dateTime);
  const timeUntilMeeting = startTime - now;
  
  // Only show popup for meetings starting within 3 minutes
  if (timeUntilMeeting <= 3 * 60 * 1000) {
    // If we already have a popup for this meeting, just update the timer
    if (currentMeeting && currentMeeting.id === meeting.id) {
      updateTimer(startTime);
      return;
    }
    
    // Otherwise, create a new popup
    currentMeeting = meeting;
    createOrUpdatePopup(meeting);
    
    // Start the timer
    updateTimer(startTime);
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    timerInterval = setInterval(() => updateTimer(startTime), 1000);
  }
}

// Create or update the meeting popup
function createOrUpdatePopup(meeting) {
  // If popup already exists, update it
  if (meetingPopup) {
    const titleElement = meetingPopup.querySelector('.meeting-popup-title');
    if (titleElement) {
      titleElement.textContent = meeting.summary || 'Next Meeting';
    }
    return;
  }
  
  // Create popup container
  meetingPopup = document.createElement('div');
  meetingPopup.className = 'meeting-popup';
  meetingPopup.id = 'meeting-next-popup';
  
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
  timerElement.id = 'meeting-timer';
  timerElement.textContent = '00:00';
  
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
  
  // Add elements to popup
  popupHeader.appendChild(popupTitle);
  meetingPopup.appendChild(popupHeader);
  meetingPopup.appendChild(timerElement);
  meetingPopup.appendChild(joinButton);
  
  // Add dragging functionality
  popupHeader.addEventListener('mousedown', startDragging);
  document.addEventListener('mousemove', dragPopup);
  document.addEventListener('mouseup', stopDragging);
  
  // Add popup to page
  document.body.appendChild(meetingPopup);
  
  // Position popup in the bottom right corner initially
  meetingPopup.style.right = '16px';
  meetingPopup.style.bottom = '16px';
}

// Update the timer display
function updateTimer(startTime) {
  if (!meetingPopup) return;
  
  const now = new Date();
  const timeUntilMeeting = startTime - now;
  
  // If meeting has started, remove popup after a short delay
  if (timeUntilMeeting <= 0) {
    const joinButton = meetingPopup.querySelector('.meeting-popup-join-button');
    if (joinButton) {
      joinButton.classList.add('glow');
    }
    
    const timerElement = meetingPopup.querySelector('#meeting-timer');
    if (timerElement) {
      timerElement.textContent = 'Now!';
      timerElement.classList.add('time-up');
    }
    
    // Remove popup 5 minutes after meeting start
    if (timeUntilMeeting < -5 * 60 * 1000) {
      removePopup();
    }
    
    return;
  }
  
  // Format time remaining
  const minutes = Math.floor(timeUntilMeeting / 60000);
  const seconds = Math.floor((timeUntilMeeting % 60000) / 1000);
  
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const timerElement = meetingPopup.querySelector('#meeting-timer');
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
function removePopup() {
  if (meetingPopup && meetingPopup.parentNode) {
    meetingPopup.parentNode.removeChild(meetingPopup);
    meetingPopup = null;
  }
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  currentMeeting = null;
}

// Start dragging the popup
function startDragging(e) {
  isDragging = true;
  
  // Calculate the offset of the mouse pointer from the popup's top-left corner
  const rect = meetingPopup.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  // Prevent text selection during drag
  e.preventDefault();
}

// Drag the popup
function dragPopup(e) {
  if (!isDragging || !meetingPopup) return;
  
  // Calculate new position
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  
  // Apply new position
  meetingPopup.style.left = `${x}px`;
  meetingPopup.style.top = `${y}px`;
  
  // Remove right/bottom positioning if we're using left/top
  meetingPopup.style.right = 'auto';
  meetingPopup.style.bottom = 'auto';
}

// Stop dragging
function stopDragging() {
  isDragging = false;
}
