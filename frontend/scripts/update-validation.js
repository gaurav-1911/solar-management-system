const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'admin', 'dashboard', 'dashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

let modified = false;

// ============================================================
// 1. CLIENT FORM - Replace the entire client form section
// ============================================================
const oldClientForm = `                {quickActionType === "client" && (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Client Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.name || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. rajesh@email.com"
                        value={formInputs.email || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            email: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +91-98765-43210"
                        value={formInputs.phone || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            phone: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>System Capacity (kW)</label>
                      <input
                        type="text"
                        placeholder="e.g. 5kW or 8kW"
                        value={formInputs.capacity || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            capacity: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <Dropdown
                        value={formInputs.status || "Active"}
                        onChange={(val) => setFormInputs({ ...formInputs, status: val })}
                        options={[
                          { value: "Active", label: "Active" },
                          { value: "Pending", label: "Pending" },
                        ]}
                        variant="form"
                      />
                    </div>
                  </div>
                )}`;

const newClientForm = `                {quickActionType === "client" && (
                  <div className="form-grid">
                    <div className={"form-group full-width" + (formErrors.name ? " has-error" : "")}>
                      <label>Client Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.name || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, name: e.target.value });
                          if (formErrors.name) setFormErrors(p => { const c={...p}; delete c.name; return c; });
                        }}
                      />
                      {formErrors.name && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.name}</span>}
                    </div>
                    <div className={"form-group" + (formErrors.email ? " has-error" : "")}>
                      <label>Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. rajesh@email.com"
                        value={formInputs.email || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, email: e.target.value });
                          if (formErrors.email) setFormErrors(p => { const c={...p}; delete c.email; return c; });
                        }}
                      />
                      {formErrors.email && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.email}</span>}
                    </div>
                    <div className={"form-group" + (formErrors.phone ? " has-error" : "")}>
                      <label>Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +91-98765-43210"
                        value={formInputs.phone || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, phone: e.target.value });
                          if (formErrors.phone) setFormErrors(p => { const c={...p}; delete c.phone; return c; });
                        }}
                      />
                      {formErrors.phone && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.phone}</span>}
                    </div>
                    <div className="form-group">
                      <label>System Capacity (kW)</label>
                      <input
                        type="text"
                        placeholder="e.g. 5kW or 8kW"
                        value={formInputs.capacity || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, capacity: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Status</label>
                      <Dropdown
                        value={formInputs.status || "Active"}
                        onChange={(val) => setFormInputs({ ...formInputs, status: val })}
                        options={[
                          { value: "Active", label: "Active" },
                          { value: "Pending", label: "Pending" },
                        ]}
                        variant="form"
                      />
                    </div>
                  </div>
                )}`;

if (content.includes(oldClientForm)) {
  content = content.replace(oldClientForm, newClientForm);
  console.log('✅ Client form updated');
  modified = true;
} else {
  console.log('⚠️ Client form - old string not found, trying with \\r\\n');
  const oldClientFormCRLF = oldClientForm.replace(/\n/g, '\r\n');
  if (content.includes(oldClientFormCRLF)) {
    content = content.replace(oldClientFormCRLF, newClientForm.replace(/\n/g, '\r\n'));
    console.log('✅ Client form updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Client form - old string NOT FOUND');
  }
}

// ============================================================
// 2. QUOTE FORM - Replace the entire quote form section
// ============================================================
const oldQuoteForm = `                {quickActionType === "quote" && (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Client / Prospect Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.clientName || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            clientName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>System Size</label>
                      <input
                        type="text"
                        placeholder="e.g. 5kW"
                        value={formInputs.systemSize || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            systemSize: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Quote Amount ($) *</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 12000"
                        value={formInputs.value || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            value: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Notes / Scope of Work</label>
                      <textarea
                        placeholder="Special discounts, site parameters, panel type..."
                        value={formInputs.notes || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            notes: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}`;

const newQuoteForm = `                {quickActionType === "quote" && (
                  <div className="form-grid">
                    <div className={"form-group full-width" + (formErrors.clientName ? " has-error" : "")}>
                      <label>Client / Prospect Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.clientName || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, clientName: e.target.value });
                          if (formErrors.clientName) setFormErrors(p => { const c={...p}; delete c.clientName; return c; });
                        }}
                      />
                      {formErrors.clientName && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.clientName}</span>}
                    </div>
                    <div className="form-group">
                      <label>System Size</label>
                      <input
                        type="text"
                        placeholder="e.g. 5kW"
                        value={formInputs.systemSize || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, systemSize: e.target.value })
                        }
                      />
                    </div>
                    <div className={"form-group" + (formErrors.value ? " has-error" : "")}>
                      <label>Quote Amount ($) *</label>
                      <input
                        type="number"
                        placeholder="e.g. 12000"
                        value={formInputs.value || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, value: e.target.value });
                          if (formErrors.value) setFormErrors(p => { const c={...p}; delete c.value; return c; });
                        }}
                      />
                      {formErrors.value && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.value}</span>}
                    </div>
                    <div className="form-group full-width">
                      <label>Notes / Scope of Work</label>
                      <textarea
                        placeholder="Special discounts, site parameters, panel type..."
                        value={formInputs.notes || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, notes: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}`;

if (content.includes(oldQuoteForm)) {
  content = content.replace(oldQuoteForm, newQuoteForm);
  console.log('✅ Quote form updated');
  modified = true;
} else {
  const oldQuoteFormCRLF = oldQuoteForm.replace(/\n/g, '\r\n');
  if (content.includes(oldQuoteFormCRLF)) {
    content = content.replace(oldQuoteFormCRLF, newQuoteForm.replace(/\n/g, '\r\n'));
    console.log('✅ Quote form updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Quote form - old string NOT FOUND');
  }
}

// ============================================================
// 3. INSTALL FORM - Replace the entire install form section
// ============================================================
const oldInstallForm = `                {quickActionType === "install" && (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Client Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.clientName || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            clientName: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Scheduled Month</label>
                      <Dropdown
                        value={formInputs.month || "Jul"}
                        onChange={(val) => setFormInputs({ ...formInputs, month: val })}
                        options={[
                          { value: "Jan", label: "January" },
                          { value: "Feb", label: "February" },
                          { value: "Mar", label: "March" },
                          { value: "Apr", label: "April" },
                          { value: "May", label: "May" },
                          { value: "Jun", label: "June" },
                          { value: "Jul", label: "July" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group">
                      <label>Initial Status</label>
                      <Dropdown
                        value={formInputs.status || "Pending"}
                        onChange={(val) => setFormInputs({ ...formInputs, status: val })}
                        options={[
                          { value: "Pending", label: "Pending" },
                          { value: "Completed", label: "Completed" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Installation Address</label>
                      <input
                        type="text"
                        placeholder="e.g. 123 MG Road, Bangalore"
                        value={formInputs.address || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            address: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}`;

const newInstallForm = `                {quickActionType === "install" && (
                  <div className="form-grid">
                    <div className={"form-group full-width" + (formErrors.clientName ? " has-error" : "")}>
                      <label>Client Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Kumar"
                        value={formInputs.clientName || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, clientName: e.target.value });
                          if (formErrors.clientName) setFormErrors(p => { const c={...p}; delete c.clientName; return c; });
                        }}
                      />
                      {formErrors.clientName && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.clientName}</span>}
                    </div>
                    <div className="form-group">
                      <label>Scheduled Month</label>
                      <Dropdown
                        value={formInputs.month || "Jul"}
                        onChange={(val) => setFormInputs({ ...formInputs, month: val })}
                        options={[
                          { value: "Jan", label: "January" },
                          { value: "Feb", label: "February" },
                          { value: "Mar", label: "March" },
                          { value: "Apr", label: "April" },
                          { value: "May", label: "May" },
                          { value: "Jun", label: "June" },
                          { value: "Jul", label: "July" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group">
                      <label>Initial Status</label>
                      <Dropdown
                        value={formInputs.status || "Pending"}
                        onChange={(val) => setFormInputs({ ...formInputs, status: val })}
                        options={[
                          { value: "Pending", label: "Pending" },
                          { value: "Completed", label: "Completed" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Installation Address</label>
                      <input
                        type="text"
                        placeholder="e.g. 123 MG Road, Bangalore"
                        value={formInputs.address || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, address: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}`;

if (content.includes(oldInstallForm)) {
  content = content.replace(oldInstallForm, newInstallForm);
  console.log('✅ Install form updated');
  modified = true;
} else {
  const oldInstallFormCRLF = oldInstallForm.replace(/\n/g, '\r\n');
  if (content.includes(oldInstallFormCRLF)) {
    content = content.replace(oldInstallFormCRLF, newInstallForm.replace(/\n/g, '\r\n'));
    console.log('✅ Install form updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Install form - old string NOT FOUND');
  }
}

// ============================================================
// 4. TICKET FORM - Replace the entire ticket form section
// ============================================================
const oldTicketForm = `                {quickActionType === "ticket" && (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Issue Subject *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Inverter not responding"
                        value={formInputs.subject || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            subject: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Client Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Meera Iyer"
                        value={formInputs.client || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            client: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Priority</label>
                      <Dropdown
                        value={formInputs.priority || "High"}
                        onChange={(val) => setFormInputs({ ...formInputs, priority: val })}
                        options={[
                          { value: "High", label: "High" },
                          { value: "Medium", label: "Medium" },
                          { value: "Low", label: "Low" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Description of Issue</label>
                      <textarea
                        placeholder="Please describe inverter code, output levels, or billing issue..."
                        value={formInputs.description || ""}
                        onChange={(e) =>
                          setFormInputs({
                            ...formInputs,
                            description: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}`;

const newTicketForm = `                {quickActionType === "ticket" && (
                  <div className="form-grid">
                    <div className={"form-group full-width" + (formErrors.subject ? " has-error" : "")}>
                      <label>Issue Subject *</label>
                      <input
                        type="text"
                        placeholder="e.g. Inverter not responding"
                        value={formInputs.subject || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, subject: e.target.value });
                          if (formErrors.subject) setFormErrors(p => { const c={...p}; delete c.subject; return c; });
                        }}
                      />
                      {formErrors.subject && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.subject}</span>}
                    </div>
                    <div className={"form-group" + (formErrors.client ? " has-error" : "")}>
                      <label>Client Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Meera Iyer"
                        value={formInputs.client || ""}
                        onChange={(e) => {
                          setFormInputs({ ...formInputs, client: e.target.value });
                          if (formErrors.client) setFormErrors(p => { const c={...p}; delete c.client; return c; });
                        }}
                      />
                      {formErrors.client && <span className="field-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{formErrors.client}</span>}
                    </div>
                    <div className="form-group">
                      <label>Priority</label>
                      <Dropdown
                        value={formInputs.priority || "High"}
                        onChange={(val) => setFormInputs({ ...formInputs, priority: val })}
                        options={[
                          { value: "High", label: "High" },
                          { value: "Medium", label: "Medium" },
                          { value: "Low", label: "Low" },
                        ]}
                        variant="form"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Description of Issue</label>
                      <textarea
                        placeholder="Please describe inverter code, output levels, or billing issue..."
                        value={formInputs.description || ""}
                        onChange={(e) =>
                          setFormInputs({ ...formInputs, description: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}`;

if (content.includes(oldTicketForm)) {
  content = content.replace(oldTicketForm, newTicketForm);
  console.log('✅ Ticket form updated');
  modified = true;
} else {
  const oldTicketFormCRLF = oldTicketForm.replace(/\n/g, '\r\n');
  if (content.includes(oldTicketFormCRLF)) {
    content = content.replace(oldTicketFormCRLF, newTicketForm.replace(/\n/g, '\r\n'));
    console.log('✅ Ticket form updated (CRLF)');
    modified = true;
  } else {
    console.log('❌ Ticket form - old string NOT FOUND');
  }
}

// ============================================================
// 5. UPDATE CANCEL BUTTON - Add setFormErrors({}) to Cancel
// ============================================================
// The Cancel button currently has: onClick={() => setQuickActionType(null)}
// We need to also reset errors

const oldCancelBtn = `                  onClick={() => setQuickActionType(null)}`;

const newCancelBtn = `                  onClick={() => { setQuickActionType(null); setFormErrors({}); }`;

if (content.includes(oldCancelBtn)) {
  // Only replace the one inside modal-footer (not the modal-close-btn)
  // Let's find the last occurrence which is the Cancel button
  const allOccurrences = content.match(new RegExp(oldCancelBtn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
  if (allOccurrences && allOccurrences.length > 1) {
    // Replace only the last occurrence (Cancel button), keep the first (close button)
    const lastIdx = content.lastIndexOf(oldCancelBtn);
    content = content.substring(0, lastIdx) + newCancelBtn + content.substring(lastIdx + oldCancelBtn.length);
    console.log('✅ Cancel button updated (last occurrence)');
    modified = true;
  } else {
    content = content.replace(oldCancelBtn, newCancelBtn);
    console.log('✅ Cancel button updated');
    modified = true;
  }
} else {
  const oldCancelBtnCRLF = `                  onClick={() => setQuickActionType(null)}\r`;
  const newCancelBtnCRLF = `                  onClick={() => { setQuickActionType(null); setFormErrors({}); }\r`;
  if (content.includes(oldCancelBtnCRLF)) {
    const lastIdx = content.lastIndexOf(oldCancelBtnCRLF);
    content = content.substring(0, lastIdx) + newCancelBtnCRLF + content.substring(lastIdx + oldCancelBtnCRLF.length);
    console.log('✅ Cancel button updated (CRLF, last occurrence)');
    modified = true;
  } else {
    console.log('❌ Cancel button - old string NOT FOUND');
  }
}

// Write the file if modified
if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('\n✅ File written successfully!');
} else {
  console.log('\n⚠️ No changes were made. Check the old strings.');
}
