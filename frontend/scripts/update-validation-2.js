const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'admin', 'dashboard', 'dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

let modified = false;

// 1. Update onClick on modal-overlay to also reset formErrors
const oldOverlay = `<div className="modal-overlay" onClick={() => setQuickActionType(null)}>`;
const newOverlay = `<div className="modal-overlay" onClick={() => { setQuickActionType(null); setFormErrors({}); }}>`;
if (content.includes(oldOverlay)) {
  content = content.replace(oldOverlay, newOverlay);
  console.log('✅ Modal overlay close updated');
  modified = true;
} else {
  console.log('❌ Modal overlay - not found');
}

// 2. Update modal-close-btn onClick to also reset formErrors
const oldCloseBtn = `onClick={() => setQuickActionType(null)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>`;
const newCloseBtn = `onClick={() => { setQuickActionType(null); setFormErrors({}); }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>`;
if (content.includes(oldCloseBtn)) {
  content = content.replace(oldCloseBtn, newCloseBtn);
  console.log('✅ Close button updated');
  modified = true;
} else {
  console.log('❌ Close button - not found, trying CRLF');
  const oldCloseBtnCRLF = oldCloseBtn.replace(/\n/g, '\r\n');
  const newCloseBtnCRLF = newCloseBtn.replace(/\n/g, '\r\n');
  if (content.includes(oldCloseBtnCRLF)) {
    content = content.replace(oldCloseBtnCRLF, newCloseBtnCRLF);
    console.log('✅ Close button updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Close button - not found');
  }
}

// 3. Update the submit handler end to also reset formErrors
// Look for: setQuickActionType(null);\n    setFormInputs({});
// Replace with: setQuickActionType(null);\n    setFormInputs({});\n    setFormErrors({});
const oldSubmitEnd = `    setQuickActionType(null);
    setFormInputs({});
  };`;
const newSubmitEnd = `    setQuickActionType(null);
    setFormInputs({});
    setFormErrors({});
  };`;

if (content.includes(oldSubmitEnd)) {
  content = content.replace(oldSubmitEnd, newSubmitEnd);
  console.log('✅ Submit handler end updated');
  modified = true;
} else {
  const oldSubmitEndCRLF = oldSubmitEnd.replace(/\n/g, '\r\n');
  const newSubmitEndCRLF = newSubmitEnd.replace(/\n/g, '\r\n');
  if (content.includes(oldSubmitEndCRLF)) {
    content = content.replace(oldSubmitEndCRLF, newSubmitEndCRLF);
    console.log('✅ Submit handler end updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Submit handler end - not found');
  }
}

if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('\n✅ File written successfully!');
} else {
  console.log('\n⚠️ No changes were made.');
}
