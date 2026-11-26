const fs = require('fs');
const http = require('http');

let allPassed = true;
function assert(desc, condition) {
  if (condition) {
    console.log(`[PASS] ${desc}`);
  } else {
    console.error(`[FAIL] ${desc}`);
    allPassed = false;
  }
}

console.log('=== YATRASATHI TRIP PLANNER VERIFICATION ===\n');

// 1. Read app.html
const appHtml = fs.readFileSync('app.html', 'utf8');

// 2. Check 8 navigation items in order
const expectedNavOrder = [
  '1. Explore India',
  '2. My Trips',
  '3. Itinerary Builder',
  '4. Maps & Routes',
  '5. Bookings',
  '6. Expenses',
  '7. Achievements',
  '8. Profile & Settings'
];

expectedNavOrder.forEach(item => {
  assert(`Contains navigation label: "${item}"`, appHtml.includes(item));
});

// Check order in HTML
let lastIndex = -1;
let orderCorrect = true;
expectedNavOrder.forEach(item => {
  const idx = appHtml.indexOf(item);
  if (idx < lastIndex) {
    orderCorrect = false;
  }
  lastIndex = idx;
});
assert('Navigation items appear in the exact required order', orderCorrect);

// 3. Check all 8 sections exist
const expectedSections = [
  'id="section-explore-india"',
  'id="section-my-trips"',
  'id="section-itinerary-builder"',
  'id="section-maps-routes"',
  'id="section-bookings"',
  'id="section-expenses"',
  'id="section-achievements"',
  'id="section-profile-settings"'
];

expectedSections.forEach(sec => {
  assert(`Contains section target: ${sec}`, appHtml.includes(sec));
});

// 4. Check Mandatory Disclosures
assert(
  'Contains Booking Record Disclosure banner',
  appHtml.includes('YatraSathi organizes travel plans and does not make, confirm, pay for, change, or cancel external reservations') ||
  appHtml.includes('YatraSathi does not book, confirm, or modify external reservations')
);

// 5. Check ID Uniqueness in app.html
const idRegex = /\s+id="([^"]+)"/g;
let match;
const seenIds = new Set();
const duplicateIds = [];
while ((match = idRegex.exec(appHtml)) !== null) {
  const id = match[1];
  if (seenIds.has(id)) {
    duplicateIds.push(id);
  }
  seenIds.add(id);
}
assert(`All element IDs in app.html are unique (duplicates: ${duplicateIds.join(', ') || 'none'})`, duplicateIds.length === 0);

// 6. Check Form Labels Accessibility
const labelForRegex = /<label[^>]*for="([^"]+)"[^>]*>/g;
const missingTargets = [];
while ((match = labelForRegex.exec(appHtml)) !== null) {
  const forAttr = match[1];
  if (!seenIds.has(forAttr)) {
    missingTargets.push(forAttr);
  }
}
assert(`All label 'for' attributes point to valid inputs (missing: ${missingTargets.join(', ') || 'none'})`, missingTargets.length === 0);

// 7. Test Local HTTP Preview Server
http.get('http://localhost:3000/app.html', res => {
  assert(`Preview server responds with HTTP 200 (Got: ${res.statusCode})`, res.statusCode === 200);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    assert('Preview server serves complete HTML document', body.includes('<!DOCTYPE html>') && body.includes('</html>'));
    console.log('\n=== VERIFICATION SUMMARY ===');
    if (allPassed) {
      console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('SOME CHECKS FAILED. PLEASE REVIEW.');
      process.exit(1);
    }
  });
}).on('error', err => {
  console.error(`Preview server connection error: ${err.message}`);
  process.exit(1);
});
