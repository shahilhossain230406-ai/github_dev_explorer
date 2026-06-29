// ----------------------------------------------------------------------
// Constants for language colors (for the donut chart)
// ----------------------------------------------------------------------
const languageColors = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219', 'C++': '#f34b7d', C: '#555',
  'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
  Dart: '#00B4AB', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00', R: '#198CE7',
  Scala: '#c22d40', Lua: '#000080', Haskell: '#5e5086', Elixir: '#6e4a7e', Other: '#8b949e'
};

// Helper function to get a color for a language
function getLanguageColor(langName) {
  if (languageColors[langName]) {
    return languageColors[langName];
  }
  return '#8b949e'; // Default gray color
}

// ----------------------------------------------------------------------
// Utility functions
// ----------------------------------------------------------------------

// Converts a date string into a readable "relative" time like "2 days ago"
function getRelativeTime(dateString) {
  const now = new Date();
  const pastDate = new Date(dateString);
  const secondsPast = (now.getTime() - pastDate.getTime()) / 1000;

  if (secondsPast < 60) {
    return 'just now';
  }
  if (secondsPast < 3600) {
    return Math.floor(secondsPast / 60) + 'm ago';
  }
  if (secondsPast < 86400) { // 86400 seconds = 1 day
    return Math.floor(secondsPast / 3600) + 'h ago';
  }
  if (secondsPast < 2592000) { // 30 days
    return Math.floor(secondsPast / 86400) + 'd ago';
  }
  if (secondsPast < 31536000) { // 365 days
    return Math.floor(secondsPast / 2592000) + 'mo ago';
  }
  return Math.floor(secondsPast / 31536000) + 'y ago';
}

// Formats large numbers like 1500 to "1.5k"
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace('.0', '') + 'k';
  }
  return num;
}

// A helper function to easily grab elements from the HTML by their ID
function $(id) {
  return document.getElementById(id);
}

// ----------------------------------------------------------------------
// Global State Variables
// ----------------------------------------------------------------------
let allRepositories = []; // We will store all fetched repos here
let currentSortMethod = 'updated'; // Default sorting is by recently updated

// ----------------------------------------------------------------------
// Theme Management (Dark/Light mode)
// ----------------------------------------------------------------------
function applyTheme(themeName) {
  document.documentElement.dataset.theme = themeName;
  localStorage.setItem('gh_theme', themeName); // Save user preference
}

// Check if the user already chose a theme in the past
let savedTheme = localStorage.getItem('gh_theme');
if (!savedTheme) {
  savedTheme = 'dark'; // Default to dark mode
}
applyTheme(savedTheme);

// Event listener for the theme toggle button
$('themeBtn').addEventListener('click', function () {
  if (document.documentElement.dataset.theme === 'dark') {
    applyTheme('light');
  } else {
    applyTheme('dark');
  }
});

// ----------------------------------------------------------------------
// Quick Demo / Hint Buttons
// ----------------------------------------------------------------------
const hintButtons = document.querySelectorAll('.hint-btn');
for (let i = 0; i < hintButtons.length; i++) {
  hintButtons[i].addEventListener('click', function () {
    const username = this.getAttribute('data-u'); // Get the username from the button
    $('uInput').value = username; // Put it in the search box
    performSearch(); // Start the search
  });
}

// ----------------------------------------------------------------------
// Error Handling
// ----------------------------------------------------------------------
function showError(message) {
  $('errMsg').innerHTML = message;
  $('errBanner').classList.remove('hidden');
}

function hideError() {
  $('errBanner').classList.add('hidden');
}

$('errClose').addEventListener('click', hideError);

// ----------------------------------------------------------------------
// Rate Limit Tracking
// ----------------------------------------------------------------------
// GitHub API has limits. We show the user how many requests they have left.
function updateRateLimitDisplay(remaining, resetTime) {
  if (remaining === null) {
    return;
  }

  remaining = parseInt(remaining, 10);
  $('rText').textContent = 'API: ' + remaining + '/60';

  const dot = $('rDot');
  dot.className = 'rate-dot'; // Reset classes

  if (remaining < 10) {
    dot.classList.add('danger'); // Red blinking dot
    if (resetTime) {
      const timeString = new Date(resetTime * 1000).toLocaleTimeString();
      showError('🚦 Rate limit low (' + remaining + ' left). Resets at <strong>' + timeString + '</strong>. Set <code>localStorage.gh_token</code> for 5,000/hr.');
    }
  } else if (remaining < 20) {
    dot.classList.add('warn'); // Yellow dot
  }
}

// ----------------------------------------------------------------------
// Main Fetch Function (Making the API calls)
// ----------------------------------------------------------------------
async function fetchFromGitHub(url) {
  // Check if user has a personal access token saved in local storage
  const token = localStorage.getItem('gh_token');

  // Setup the request headers
  const headers = {
    'Accept': 'application/vnd.github+json'
  };

  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  // Make the actual network request
  const response = await fetch(url, { headers: headers });

  // Read the rate limit headers sent back by GitHub
  const limitRemaining = response.headers.get('X-RateLimit-Remaining');
  const limitReset = response.headers.get('X-RateLimit-Reset');
  updateRateLimitDisplay(limitRemaining, limitReset);

  // Handle different error status codes
  if (response.status === 403 || response.status === 429) {
    const resetTime = response.headers.get('X-RateLimit-Reset');
    let formattedTime = 'soon';
    if (resetTime) {
      formattedTime = new Date(resetTime * 1000).toLocaleTimeString();
    }
    // Throw a custom error object that we catch later
    throw { type: 'rateLimitError', time: formattedTime };
  }

  if (response.status === 404) {
    throw { type: 'notFoundError' };
  }

  if (!response.ok) {
    throw { type: 'networkError', status: response.status };
  }

  // If everything is OK, parse the JSON and return it
  return response.json();
}

// ----------------------------------------------------------------------
// Loading Skeletons (UI Placeholders while data loads)
// ----------------------------------------------------------------------
function generateSkeletonLine(width) {
  return '<div class="sk sk-line" style="width:' + width + '"></div>';
}

function showLoadingSkeletons() {
  $('results').classList.remove('hidden');

  // Profile skeleton
  let profHtml = '<div class="prof">';
  profHtml += '<div class="sk sk-circle"></div>';
  profHtml += '<div style="padding-top:6px">' + generateSkeletonLine('70%') + generateSkeletonLine('50%') + generateSkeletonLine('40%') + generateSkeletonLine('60%') + '</div>';
  profHtml += '<div style="display:flex;flex-direction:column;gap:8px">';
  profHtml += '<div class="sk" style="height:56px;width:82px;border-radius:8px"></div>'.repeat(3);
  profHtml += '</div></div>';
  $('profContent').innerHTML = profHtml;

  // Lang chart skeleton
  let langHtml = '';
  const widths = ['90%', '65%', '75%', '50%', '60%'];
  for (let i = 0; i < 5; i++) {
    langHtml += generateSkeletonLine(widths[i]);
  }
  $('langContent').innerHTML = langHtml;

  // Activity skeleton
  let actHtml = '';
  const actWidths = ['85%', '60%', '75%', '50%', '70%', '55%'];
  for (let i = 0; i < 6; i++) {
    actHtml += generateSkeletonLine(actWidths[i]);
  }
  $('actContent').innerHTML = actHtml;

  // Repos skeleton
  let repoHtml = '<div class="repo-grid">';
  for (let i = 0; i < 6; i++) {
    repoHtml += '<div class="repo-card">' + generateSkeletonLine('70%') + generateSkeletonLine('90%') + generateSkeletonLine('40%') + '</div>';
  }
  repoHtml += '</div>';
  $('repoContent').innerHTML = repoHtml;
}

// ----------------------------------------------------------------------
// Rendering Functions (Creating HTML from the data)
// ----------------------------------------------------------------------

// Render the main profile card at the top
function renderProfile(userObj) {
  const joinYear = new Date(userObj.created_at).getFullYear();

  // Build the meta information list (location, company, blog, twitter)
  const metaItems = [];

  if (userObj.location) {
    metaItems.push('<span class="pm-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>' + userObj.location + '</span>');
  }

  if (userObj.company) {
    // Remove the @ symbol if they added it
    const companyName = userObj.company.replace('@', '');
    metaItems.push('<span class="pm-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>' + companyName + '</span>');
  }

  if (userObj.blog) {
    let blogUrl = userObj.blog;
    if (!blogUrl.startsWith('http')) {
      blogUrl = 'https://' + blogUrl;
    }
    metaItems.push('<span class="pm-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg><a href="' + blogUrl + '" target="_blank" rel="noopener">' + userObj.blog + '</a></span>');
  }

  if (userObj.twitter_username) {
    metaItems.push('<span class="pm-item"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>@' + userObj.twitter_username + '</span>');
  }

  let metaHtml = metaItems.join('');
  if (metaHtml === '') {
    metaHtml = '<span style="color:var(--subtle)">No additional info</span>';
  }

  // Determine the name to display (fallback to login if name is null)
  const displayName = userObj.name ? userObj.name : userObj.login;

  let html = '<div class="prof">';
  html += '  <div><img class="prof-avatar" src="' + userObj.avatar_url + '&s=220" alt="' + userObj.login + '" width="110" height="110"/></div>';
  html += '  <div>';
  html += '    <div class="prof-name">' + displayName + '</div>';
  html += '    <div class="prof-handle">@' + userObj.login + '</div>';

  if (userObj.bio) {
    html += '    <div class="prof-bio">' + userObj.bio + '</div>';
  }

  html += '    <div class="prof-meta">' + metaHtml + '</div>';
  html += '    <div class="yr-badge">📅 Member since ' + joinYear + '</div>';
  html += '  </div>';
  html += '  <div class="stats">';
  html += '    <div class="stat-box"><div class="stat-val">' + formatNumber(userObj.followers) + '</div><div class="stat-lbl">Followers</div></div>';
  html += '    <div class="stat-box"><div class="stat-val">' + formatNumber(userObj.following) + '</div><div class="stat-lbl">Following</div></div>';
  html += '    <div class="stat-box"><div class="stat-val">' + formatNumber(userObj.public_repos) + '</div><div class="stat-lbl">Repos</div></div>';
  html += '  </div>';
  html += '</div>';

  $('profContent').innerHTML = html;
}

// Render the SVG donut chart for languages
function renderLanguageChart(reposArray) {
  // Step 1: Count how many times each language appears
  const langCounts = {};
  for (let i = 0; i < reposArray.length; i++) {
    const repo = reposArray[i];
    if (repo.language) {
      if (langCounts[repo.language]) {
        langCounts[repo.language] += 1;
      } else {
        langCounts[repo.language] = 1;
      }
    }
  }

  // Step 2: Convert object to array and sort by count (descending)
  // Example: [['JavaScript', 5], ['Python', 2]]
  const sortedEntries = Object.keys(langCounts).map(function (key) {
    return [key, langCounts[key]];
  });

  sortedEntries.sort(function (a, b) {
    return b[1] - a[1];
  });

  // Handle empty state
  if (sortedEntries.length === 0) {
    $('langContent').innerHTML = '<div class="empty"><div class="empty-ico">🔤</div><div class="empty-title">No language data</div><div class="empty-desc">No language detected in public repos.</div></div>';
    return;
  }

  // Step 3: Take top 8, group the rest into "Other"
  const topLanguages = sortedEntries.slice(0, 8);
  let otherCount = 0;
  for (let i = 8; i < sortedEntries.length; i++) {
    otherCount += sortedEntries[i][1];
  }

  if (otherCount > 0) {
    topLanguages.push(['Other', otherCount]);
  }

  // Calculate total count for percentages
  let totalCount = 0;
  for (let i = 0; i < topLanguages.length; i++) {
    totalCount += topLanguages[i][1];
  }

  // Step 4: Build the SVG pieces for the donut chart
  const radius = 55;
  const cx = 65;
  const cy = 65;
  const circumference = 2 * Math.PI * radius;

  let svgSegments = '';
  let legendHtml = '';
  let currentOffset = 0;

  for (let i = 0; i < topLanguages.length; i++) {
    const langName = topLanguages[i][0];
    const count = topLanguages[i][1];
    const percentage = (count / totalCount) * 100;

    // Math for SVG stroke-dasharray to draw a piece of the circle
    const dashLength = (percentage / 100) * circumference;
    const gapLength = circumference - dashLength;
    const color = getLanguageColor(langName);

    svgSegments += '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" ';
    svgSegments += 'stroke="' + color + '" stroke-width="18" ';
    svgSegments += 'stroke-dasharray="' + dashLength.toFixed(2) + ' ' + gapLength.toFixed(2) + '" ';
    svgSegments += 'stroke-dashoffset="' + (-currentOffset).toFixed(2) + '">';
    svgSegments += '<title>' + langName + ': ' + percentage.toFixed(1) + '%</title>';
    svgSegments += '</circle>';

    currentOffset += dashLength;

    // Build the legend row for this language
    legendHtml += '<div class="leg-item">';
    legendHtml += '  <span class="leg-dot" style="background:' + color + '"></span>';
    legendHtml += '  <span class="leg-name">' + langName + '</span>';
    legendHtml += '  <span class="leg-pct">' + percentage.toFixed(1) + '%</span>';
    legendHtml += '</div>';
    legendHtml += '<div class="lang-bar"><div class="lang-fill" style="width:' + percentage.toFixed(1) + '%;background:' + color + '"></div></div>';
  }

  // Step 5: Put it all together
  let finalHtml = '<div class="lang-wrap">';
  finalHtml += '  <div class="donut-pos" style="width:130px;height:130px">';
  finalHtml += '    <svg class="donut-svg" width="130" height="130" viewBox="0 0 130 130">';
  finalHtml += '      <circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="var(--card2)" stroke-width="18"/>';
  finalHtml += svgSegments;
  finalHtml += '    </svg>';
  finalHtml += '    <div class="donut-center"><div class="dc-val">' + sortedEntries.length + '</div><div class="dc-lbl">langs</div></div>';
  finalHtml += '  </div>';
  finalHtml += '  <div class="legend">' + legendHtml + '</div>';
  finalHtml += '</div>';

  $('langContent').innerHTML = finalHtml;
}

// Helper to format GitHub event payloads into readable text and icons
function formatEventDetails(eventObj) {
  let repoName = '';
  if (eventObj.repo && eventObj.repo.name) {
    repoName = eventObj.repo.name;
  }

  const payload = eventObj.payload || {};

  // Using standard if/else instead of switch for simplicity
  if (eventObj.type === 'PushEvent') {
    let branch = 'main';
    if (payload.ref) {
      branch = payload.ref.replace('refs/heads/', '');
    }
    let commitCount = 0;
    if (payload.commits) {
      commitCount = payload.commits.length;
    }
    let commitWord = 'commits';
    if (commitCount === 1) commitWord = 'commit';

    return {
      icon: '📦',
      text: 'Pushed <strong>' + commitCount + ' ' + commitWord + '</strong> to <strong>' + branch + '</strong>',
      repo: repoName
    };
  }
  else if (eventObj.type === 'PullRequestEvent') {
    let actionStr = payload.action;
    // Check if it was closed because it was merged
    if (actionStr === 'closed' && payload.pull_request && payload.pull_request.merged) {
      actionStr = 'merged';
    }
    return { icon: '🔀', text: '<strong>' + actionStr + '</strong> a pull request', repo: repoName };
  }
  else if (eventObj.type === 'IssuesEvent') {
    return { icon: '🐛', text: '<strong>' + payload.action + '</strong> an issue', repo: repoName };
  }
  else if (eventObj.type === 'IssueCommentEvent') {
    return { icon: '💬', text: 'Commented on an issue', repo: repoName };
  }
  else if (eventObj.type === 'ForkEvent') {
    return { icon: '🍴', text: 'Forked <strong>' + repoName + '</strong>', repo: '' }; // don't show repo below again
  }
  else if (eventObj.type === 'WatchEvent') {
    return { icon: '⭐', text: 'Starred <strong>' + repoName + '</strong>', repo: '' };
  }
  else if (eventObj.type === 'CreateEvent') {
    let refName = repoName;
    if (payload.ref) refName = payload.ref;
    return { icon: '✨', text: 'Created ' + payload.ref_type + ' <strong>' + refName + '</strong>', repo: repoName };
  }
  else if (eventObj.type === 'DeleteEvent') {
    return { icon: '🗑️', text: 'Deleted ' + payload.ref_type + ' <strong>' + payload.ref + '</strong>', repo: repoName };
  }
  else if (eventObj.type === 'ReleaseEvent') {
    let tagName = '';
    if (payload.release && payload.release.tag_name) {
      tagName = payload.release.tag_name;
    }
    return { icon: '🚀', text: 'Released <strong>' + tagName + '</strong>', repo: repoName };
  }
  else {
    // Fallback for any other event
    const cleanType = eventObj.type.replace('Event', '');
    return { icon: '🔔', text: '<strong>' + cleanType + '</strong>', repo: repoName };
  }
}

// Render the recent activity timeline
function renderActivity(eventsArray) {
  // Only show the 10 most recent events
  const visibleEvents = eventsArray.slice(0, 10);

  if (visibleEvents.length === 0) {
    $('actContent').innerHTML = '<div class="empty"><div class="empty-ico">😴</div><div class="empty-title">No public activity</div><div class="empty-desc">No recent public events found.</div></div>';
    return;
  }

  let html = '<div class="tl">';

  for (let i = 0; i < visibleEvents.length; i++) {
    const event = visibleEvents[i];
    const details = formatEventDetails(event);

    html += '<div class="tl-item">';
    html += '  <div class="tl-dot">' + details.icon + '</div>';
    html += '  <div class="tl-body">';
    html += '    <div class="tl-label">' + details.text + '</div>';

    if (details.repo !== '') {
      html += '    <div class="tl-repo"><a href="https://github.com/' + details.repo + '" target="_blank" rel="noopener">' + details.repo + '</a></div>';
    }

    html += '  </div>';
    html += '  <div class="tl-time">' + getRelativeTime(event.created_at) + '</div>';
    html += '</div>';
  }

  html += '</div>';
  $('actContent').innerHTML = html;
}

// ----------------------------------------------------------------------
// Repository Logic (Sorting, Filtering, Rendering)
// ----------------------------------------------------------------------

// Sort the repositories array based on a key
function sortRepositories(reposList, sortKey) {
  // Create a copy so we don't modify the original array
  const copy = reposList.slice();

  if (sortKey === 'stars') {
    copy.sort(function (a, b) {
      return b.stargazers_count - a.stargazers_count; // Descending
    });
  } else if (sortKey === 'forks') {
    copy.sort(function (a, b) {
      return b.forks_count - a.forks_count; // Descending
    });
  } else if (sortKey === 'name') {
    copy.sort(function (a, b) {
      // Alphabetical sort using localeCompare
      return a.name.localeCompare(b.name);
    });
  } else {
    // Default: Sort by updated_at
    copy.sort(function (a, b) {
      const dateA = new Date(a.updated_at);
      const dateB = new Date(b.updated_at);
      return dateB.getTime() - dateA.getTime(); // Newest first
    });
  }

  return copy;
}

// Render the repository cards
function renderRepositories(reposList, sortMethod, filterText) {
  let filteredList = reposList;

  // Step 1: Filter by text if user typed something
  if (filterText) {
    const lowerFilter = filterText.toLowerCase();
    filteredList = [];

    for (let i = 0; i < reposList.length; i++) {
      const repo = reposList[i];
      const nameMatch = repo.name.toLowerCase().indexOf(lowerFilter) !== -1;

      let descMatch = false;
      if (repo.description) {
        descMatch = repo.description.toLowerCase().indexOf(lowerFilter) !== -1;
      }

      if (nameMatch || descMatch) {
        filteredList.push(repo);
      }
    }
  }

  // Step 2: Sort the remaining items
  const sortedList = sortRepositories(filteredList, sortMethod);

  // Step 3: Handle empty state
  if (sortedList.length === 0) {
    let emptyTitle = 'No public repos';
    let emptyDesc = 'This account has no public repositories.';

    if (filterText) {
      emptyTitle = 'No matches';
      emptyDesc = 'No repos match "' + filterText + '".';
    }

    $('repoContent').innerHTML = '<div class="empty"><div class="empty-ico">📭</div><div class="empty-title">' + emptyTitle + '</div><div class="empty-desc">' + emptyDesc + '</div></div>';
    return;
  }

  // Step 4: Build HTML
  let html = '<div class="repo-grid">';

  for (let i = 0; i < sortedList.length; i++) {
    const repo = sortedList[i];

    html += '<div class="repo-card">';
    html += '  <a class="repo-name" href="' + repo.html_url + '" target="_blank" rel="noopener">' + repo.name + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>';

    const description = repo.description ? repo.description : '<em style="color:var(--subtle)">No description</em>';
    html += '  <div class="repo-desc">' + description + '</div>';

    html += '  <div class="repo-foot">';

    if (repo.language) {
      const color = getLanguageColor(repo.language);
      html += '    <span class="l-badge"><span class="l-dot" style="background:' + color + '"></span>' + repo.language + '</span>';
    }

    html += '    <span class="r-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' + formatNumber(repo.stargazers_count) + '</span>';
    html += '    <span class="r-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>' + formatNumber(repo.forks_count) + '</span>';
    html += '    <span class="r-updated">' + getRelativeTime(repo.updated_at) + '</span>';
    html += '  </div>';
    html += '</div>';
  }

  html += '</div>';
  $('repoContent').innerHTML = html;
}

// ----------------------------------------------------------------------
// Event Listeners for Repo Sorting & Filtering
// ----------------------------------------------------------------------

// Set up click events for all the sort buttons
const sortButtons = document.querySelectorAll('.sort-btn');
for (let i = 0; i < sortButtons.length; i++) {
  sortButtons[i].addEventListener('click', function () {
    // Remove active class from all buttons
    for (let j = 0; j < sortButtons.length; j++) {
      sortButtons[j].classList.remove('active');
    }
    // Add active class to clicked button
    this.classList.add('active');

    // Update current sort method and re-render
    currentSortMethod = this.getAttribute('data-sort');
    const filterVal = $('repoFilter').value;
    renderRepositories(allRepositories, currentSortMethod, filterVal);
  });
}

// Re-render when user types in the filter input
$('repoFilter').addEventListener('input', function () {
  const filterVal = this.value;
  renderRepositories(allRepositories, currentSortMethod, filterVal);
});

// ----------------------------------------------------------------------
// Main execution function
// ----------------------------------------------------------------------
async function performSearch() {
  // Get what the user typed and remove whitespace
  const username = $('uInput').value.trim();

  // Don't search if it's empty
  if (username === '') {
    $('uInput').focus();
    return;
  }

  hideError();
  showLoadingSkeletons();

  // Reset repository filters and sorting
  $('repoFilter').value = '';
  currentSortMethod = 'updated';

  const sortButtons = document.querySelectorAll('.sort-btn');
  for (let i = 0; i < sortButtons.length; i++) {
    sortButtons[i].classList.remove('active');
  }
  $('sUpdated').classList.add('active');

  // Scroll down gently to results
  setTimeout(function () {
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);

  try {
    const baseUrl = 'https://api.github.com';

    // Fetch all 3 endpoints concurrently using Promise.all
    // This is much faster than waiting for one to finish before starting the next
    const dataPromises = [
      fetchFromGitHub(baseUrl + '/users/' + username),
      fetchFromGitHub(baseUrl + '/users/' + username + '/repos?per_page=100&sort=updated'),
      fetchFromGitHub(baseUrl + '/users/' + username + '/events/public?per_page=30')
    ];

    // Wait for all promises to resolve
    const results = await Promise.all(dataPromises);

    // Unpack results array
    const userProfileData = results[0];
    const repositoriesData = results[1];
    const eventsData = results[2];

    // Save repos globally so we can sort/filter them without re-fetching
    allRepositories = repositoriesData;

    // Draw the UI
    renderProfile(userProfileData);
    renderLanguageChart(repositoriesData);
    renderActivity(eventsData);
    renderRepositories(repositoriesData, 'updated', '');

  } catch (error) {
    // If anything failed, we hide the skeletons and show an error
    $('results').classList.add('hidden');

    if (error.type === 'notFoundError') {
      showError('No GitHub user found for <strong>"' + username + '"</strong>. Check the spelling and try again.');
    } else if (error.type === 'rateLimitError') {
      showError('🚦 Rate limit reached. Resets at <strong>' + error.time + '</strong>. Set <code>localStorage.gh_token</code> for 5,000 req/hr.');
    } else {
      // General network error
      let msg = 'Network error. Check your connection and try again.';
      if (error.status) {
        msg = 'Network error (HTTP ' + error.status + '). Check your connection and try again.';
      }
      showError(msg);
    }
  }
}

// Attach to the form submit event (triggers on enter key or button click)
$('searchForm').addEventListener('submit', function (event) {
  event.preventDefault(); // Stop page from refreshing
  performSearch();
});
