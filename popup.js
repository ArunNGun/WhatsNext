// Popup script for Google Meet Next Meeting Timer

document.addEventListener('DOMContentLoaded', initialize);

// DOM Elements
let authButton;
let statusIcon;
let statusText;
let meetingsSection;
let meetingsLoading;
let meetingsContainer;
let noMeetingsMessage;

// State
let isAuthenticated = false;

// Initialize popup
function initialize() {
  // Get DOM elements
  authButton = document.getElementById('auth-button');
  statusIcon = document.getElementById('status-icon');
  statusText = document.getElementById('status-text');
  meetingsSection = document.getElementById('meetings-section');
  meetingsLoading = document.getElementById('meetings-loading');
  meetingsContainer = document.getElementById('meetings-container');
  noMeetingsMessage = document.getElementById('no-meetings');
  
  // Add event listeners
  authButton.addEventListener('click', handleAuthButtonClick);
  
  // Check authentication status
  checkAuthStatus();
}

// Check authentication status
function checkAuthStatus() {
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error checking auth status:', chrome.runtime.lastError);
      updateAuthStatus(false, 'Error checking status');
      return;
    }
    
    console.log('Auth status response:', response);
    updateAuthStatus(response.isAuthenticated);
    
    if (response.isAuthenticated) {
      loadUpcomingMeetings();
    }
  });
}

// Update authentication status UI
function updateAuthStatus(authenticated, errorMessage = null) {
  isAuthenticated = authenticated;
  
  if (authenticated) {
    statusIcon.classList.remove('disconnected');
    statusIcon.classList.add('connected');
    statusText.textContent = 'Connected';
    authButton.textContent = 'Refresh Connection';
    meetingsSection.classList.remove('hidden');
  } else {
    statusIcon.classList.remove('connected');
    statusIcon.classList.add('disconnected');
    statusText.textContent = errorMessage || 'Not connected';
    authButton.textContent = 'Sign in with Google';
    meetingsSection.classList.add('hidden');
  }
}

// Handle auth button click
function handleAuthButtonClick() {
  authButton.disabled = true;
  authButton.textContent = 'Connecting...';
  
  chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
    authButton.disabled = false;
    
    if (chrome.runtime.lastError) {
      console.error('Authentication error:', chrome.runtime.lastError);
      updateAuthStatus(false, 'Authentication failed');
      return;
    }
    
    console.log('Authentication response:', response);
    
    if (response.success) {
      updateAuthStatus(true);
      loadUpcomingMeetings();
    } else {
      updateAuthStatus(false, response.error || 'Authentication failed');
    }
  });
}

// Load upcoming meetings
function loadUpcomingMeetings() {
  // Show loading spinner
  meetingsLoading.classList.remove('hidden');
  meetingsContainer.classList.add('hidden');
  noMeetingsMessage.classList.add('hidden');
  
  chrome.runtime.sendMessage({ action: 'getUpcomingMeetings' }, (response) => {
    // Hide loading spinner
    meetingsLoading.classList.add('hidden');
    
    if (chrome.runtime.lastError) {
      console.error('Error loading meetings:', chrome.runtime.lastError);
      return;
    }
    
    console.log('Upcoming meetings response:', response);
    
    if (response.success && response.meetings && response.meetings.length > 0) {
      displayMeetings(response.meetings);
      meetingsContainer.classList.remove('hidden');
    } else {
      noMeetingsMessage.classList.remove('hidden');
    }
  });
}

// Display meetings in the UI
function displayMeetings(meetings) {
  // Clear existing meetings
  meetingsContainer.innerHTML = '';
  
  // Sort meetings by start time
  const sortedMeetings = [...meetings].sort((a, b) => {
    return new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime();
  });
  
  // Only show the next 5 meetings
  const upcomingMeetings = sortedMeetings.slice(0, 5);
  
  // Add each meeting to the container
  upcomingMeetings.forEach(meeting => {
    const meetingElement = createMeetingElement(meeting);
    meetingsContainer.appendChild(meetingElement);
  });
}

// Create a meeting element
function createMeetingElement(meeting) {
  const meetingItem = document.createElement('div');
  meetingItem.className = 'meeting-item';
  
  // Create a container for meeting info
  const meetingInfo = document.createElement('div');
  meetingInfo.className = 'meeting-info';
  
  const title = document.createElement('div');
  title.className = 'meeting-title';
  title.textContent = meeting.summary || 'Untitled meeting';
  
  const time = document.createElement('div');
  time.className = 'meeting-time';
  
  // Format the meeting time
  const startTime = new Date(meeting.start.dateTime);
  const endTime = new Date(meeting.end.dateTime);
  
  const options = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  
  const dateOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  };
  
  // Check if meeting is today
  const today = new Date();
  const isToday = startTime.getDate() === today.getDate() &&
                  startTime.getMonth() === today.getMonth() &&
                  startTime.getFullYear() === today.getFullYear();
  
  let timeText = '';
  
  if (isToday) {
    timeText = `Today, ${startTime.toLocaleTimeString(undefined, options)} - ${endTime.toLocaleTimeString(undefined, options)}`;
  } else {
    timeText = `${startTime.toLocaleDateString(undefined, dateOptions)}, ${startTime.toLocaleTimeString(undefined, options)} - ${endTime.toLocaleTimeString(undefined, options)}`;
  }
  
  time.textContent = timeText;
  
  // Add meeting info to the container
  meetingInfo.appendChild(title);
  meetingInfo.appendChild(time);
  
  // Create join button
  const joinButton = document.createElement('button');
  joinButton.className = 'join-button';
  joinButton.textContent = 'Join';
  joinButton.title = 'Join this meeting';
  
  // Add click event to join the meeting
  joinButton.addEventListener('click', () => {
    let meetingUrl = '';
    
    if (meeting.hangoutLink) {
      meetingUrl = meeting.hangoutLink;
    } else if (meeting.conferenceData && meeting.conferenceData.conferenceId) {
      meetingUrl = `https://meet.google.com/${meeting.conferenceData.conferenceId}`;
    }
    
    if (meetingUrl) {
      // Open the meeting in a new tab
      chrome.tabs.create({ url: meetingUrl });
    }
  });
  
  // Create a flex container for the meeting item
  const flexContainer = document.createElement('div');
  flexContainer.className = 'meeting-flex-container';
  flexContainer.appendChild(meetingInfo);
  flexContainer.appendChild(joinButton);
  
  meetingItem.appendChild(flexContainer);
  
  return meetingItem;
}