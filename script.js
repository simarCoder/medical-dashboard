document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL STATE & DATABASES ---
    let patientIdCounter = 1;
    let dailySrNoCounter = 1;
    let receiptNoCounter = 6619;
    let lastResetDate = new Date().toISOString().slice(0, 10);
    const mainTestsDB = {};
    const subTestsDB = {};
    const patientDataStore = {};
    const patientTestsDB = {};
    const patientResultsDB = {}; // patientId -> { testCode: { results, status } }
    let tempSelectedTests = [];
    // Default settings for the receipt layout
    let receiptSettings = {
        marginTop: '10', marginBottom: '10', marginLeft: '10', marginRight: '10',
        textAlign: 'center', receiptWidth: '148', receiptHeight: '210',
        fontSize: '12', tableCellPadding: '5'
    };

    // --- PAGE NAVIGATION ---
    document.querySelector('.sidebar-menu').addEventListener('click', (e) => {
        const clickedLink = e.target.closest('.menu-item');
        if (!clickedLink) return;
        e.preventDefault();
        const pageId = clickedLink.dataset.page;
        if (pageId === 'settings') {
            Object.keys(receiptSettings).forEach(key => {
                const input = document.getElementById(key);
                if (input) input.value = receiptSettings[key];
            });
            updateReceiptPreview();
        } else if (pageId === 'diagnose') {
            renderDiagnoseList();
        }
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        clickedLink.classList.add('active');
        document.querySelectorAll('.page-content').forEach(page => {
            page.classList.toggle('hidden', page.id !== `${pageId}-page`);
        });
    });
    
    // --- MODAL & PATIENT LOGIC ---
    const patientModal = document.getElementById('addPatientModal');
    const openPatientModal = (isEditing = false) => {
        document.getElementById('modalSubmitBtn').textContent = isEditing ? 'Update Patient & Tests' : 'Save & Generate PDF Receipt';
        patientModal.classList.add('active');
        updatePaymentSummary(true);
    };
    const closePatientModal = () => {
        patientModal.classList.remove('active');
        document.getElementById('addPatientForm').reset();
        document.getElementById('modalTitle').textContent = 'Add New Patient Record';
        // Clear the hidden patientId input to prevent accidental edits
        document.getElementById('patientId').value = '';
        tempSelectedTests = [];
        renderTempTestsTable();
    };
    document.getElementById('addPatientBtn').addEventListener('click', () => openPatientModal(false));
    document.getElementById('closeModalBtn').addEventListener('click', closePatientModal);
    document.getElementById('cancelBtn').addEventListener('click', closePatientModal);
    document.getElementById('addTestToPatientBtn').addEventListener('click', () => {
        const testCode = document.getElementById('testSearch').value;
        const test = mainTestsDB[testCode];
        if (test) {
            if (!tempSelectedTests.find(t => t.code === test.code)) {
                tempSelectedTests.push(test);
                renderTempTestsTable();
            } else { alert('This test has already been added.'); }
            document.getElementById('testSearch').value = '';
        } else { alert('Test not found.'); }
    });
    function renderTempTestsTable() {
        const tableBody = document.getElementById('selectedTestsTableBody');
        tableBody.innerHTML = '';
        tempSelectedTests.forEach((test, index) => {
            const row = tableBody.insertRow();
            row.innerHTML = `<td>${test.name}</td><td>${test.cost.toFixed(2)}</td><td><button type="button" class="remove-btn" data-index="${index}">&times;</button></td>`;
        });
        updatePaymentSummary(true);
    }
    document.getElementById('selectedTestsTableBody').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            tempSelectedTests.splice(e.target.dataset.index, 1);
            renderTempTestsTable();
        }
    });
    function updatePaymentSummary(autoFillPaid = false) {
        const total = tempSelectedTests.reduce((sum, test) => sum + test.cost, 0);
        const discount = parseFloat(document.getElementById('discount').value) || 0;
        const payable = total - discount;
        const paidInput = document.getElementById('paidAmount');
        
        if (autoFillPaid) {
            paidInput.value = payable > 0 ? payable.toFixed(2) : "0.00";
        }
        const paid = parseFloat(paidInput.value) || 0;
        
        document.getElementById('totalAmount').textContent = total.toFixed(2);
        document.getElementById('payableAmount').textContent = payable.toFixed(2);
        document.getElementById('balanceAmount').textContent = (payable - paid).toFixed(2);
    }
    document.getElementById('discount').addEventListener('input', () => updatePaymentSummary(true));
    document.getElementById('paidAmount').addEventListener('input', () => updatePaymentSummary(false));
    
    // --- FORM SUBMISSION (FIXED TO PREVENT DUPLICATES) ---
    document.getElementById('addPatientForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const patientIdInput = document.getElementById('patientId');
        const existingPatientId = patientIdInput.value;

        // Determine if we are updating or creating
        if (existingPatientId) {
            // --- UPDATE LOGIC ---
            const patientData = patientDataStore[existingPatientId];
            patientData.name = document.getElementById('fullName').value;
            patientData.age = document.getElementById('age').value;
            patientData.gender = document.getElementById('gender').value;
            patientData.contact = document.getElementById('contact').value;
            patientData.referral = document.getElementById('referral').value;
            patientData.paymentMode = document.getElementById('paymentMode').value;
            patientData.discount = parseFloat(document.getElementById('discount').value) || 0;
            patientData.paidAmount = parseFloat(document.getElementById('paidAmount').value) || 0;
            
            patientTestsDB[existingPatientId] = [...tempSelectedTests];
            
            // Find and update the row in the dashboard table
            const tableRows = document.getElementById('patientTableBody').rows;
            for(let i = 0; i < tableRows.length; i++){
                if(tableRows[i].cells[1].textContent == existingPatientId){
                    updateDashboardRow(tableRows[i], patientData);
                    break;
                }
            }
        } else {
            // --- CREATE NEW LOGIC ---
            const newPatientId = patientIdCounter++;
            const patientData = {
                srNo: getDailySrNo(),
                id: newPatientId,
                name: document.getElementById('fullName').value,
                age: document.getElementById('age').value,
                gender: document.getElementById('gender').value,
                status: 'Stable',
                contact: document.getElementById('contact').value,
                referral: document.getElementById('referral').value,
                paymentMode: document.getElementById('paymentMode').value,
                discount: parseFloat(document.getElementById('discount').value) || 0,
                paidAmount: parseFloat(document.getElementById('paidAmount').value) || 0
            };
            patientDataStore[newPatientId] = patientData;
            patientTestsDB[newPatientId] = [...tempSelectedTests];
            
            const newRow = document.getElementById('patientTableBody').insertRow();
            updateDashboardRow(newRow, patientData);
            printPatientReceipt(newPatientId);
        }
        closePatientModal();
    });

    function updateDashboardRow(row, data) {
        row.innerHTML = `<td>${data.srNo}</td><td>${data.id}</td><td>${data.name}</td><td>${data.age}</td><td><span class="status status-stable">${data.status}</span></td><td class="action-buttons"><button class="action-btn view-btn" data-id="${data.id}"><i class="fa-solid fa-eye"></i></button><button class="action-btn edit-btn" data-id="${data.id}"><i class="fa-solid fa-pencil"></i></button><button class="action-btn receipt-btn" data-id="${data.id}"><i class="fa-solid fa-receipt"></i></button><button class="action-btn delete-btn" data-id="${data.id}"><i class="fa-solid fa-trash"></i></button></td>`;
    }

    document.getElementById('patientTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('.action-btn');
        if (!button) return;
        const patientId = button.dataset.id;
        if (button.classList.contains('edit-btn')) {
            const data = patientDataStore[patientId];
            document.getElementById('modalTitle').textContent = 'Edit Patient Details';
            
            document.getElementById('fullName').value = data.name;
            document.getElementById('age').value = data.age;
            document.getElementById('gender').value = data.gender;
            document.getElementById('contact').value = data.contact;
            document.getElementById('referral').value = data.referral;
            document.getElementById('paymentMode').value = data.paymentMode;
            document.getElementById('discount').value = data.discount;
            document.getElementById('paidAmount').value = data.paidAmount;
            
            // Set the hidden input with the patient ID to signify "edit mode"
            document.getElementById('patientId').value = data.id;

            tempSelectedTests = patientTestsDB[patientId] ? [...patientTestsDB[patientId]] : [];
            renderTempTestsTable();
            openPatientModal(true);
        } else if (button.classList.contains('view-btn')) { showTestDetails(patientId);
        } else if (button.classList.contains('receipt-btn')) { printPatientReceipt(patientId);
        } else if (button.classList.contains('delete-btn')) {
            if (confirm(`Are you sure you want to delete patient #${patientId}?`)) {
                delete patientDataStore[patientId]; 
                delete patientTestsDB[patientId]; 
                button.closest('tr').remove();
            }
        }
    });

    // --- DIAGNOSE PAGE LOGIC ---
    function renderDiagnoseList() {
        const diagnoseListContainer = document.getElementById('diagnosePatientList');
        diagnoseListContainer.innerHTML = '';
        Object.values(patientDataStore).forEach(patient => {
            const patientTests = patientTestsDB[patient.id] || [];
            if (patientTests.length === 0) return;

            let testsHTML = '';
            patientTests.forEach(test => {
                const results = patientResultsDB[patient.id]?.[test.code];
                const status = results ? results.status : 'pending';
                testsHTML += `
                    <div class="diagnose-test-item">
                        <span>${test.name} (${test.code})</span>
                        <div class="d-flex align-items-center" style="gap: 1rem;">
                           <span class="diagnose-status ${status}">${status}</span>
                           <button class="primary-btn" data-patient-id="${patient.id}" data-test-code="${test.code}">Diagnose</button>
                        </div>
                    </div>`;
            });

            const cardHTML = `
                <div class="diagnose-patient-card">
                    <div class="diagnose-patient-header">
                        <h4>${patient.name} (ID: ${patient.id})</h4>
                        <span>${patient.age} / ${patient.gender}</span>
                    </div>
                    <div class="diagnose-tests-list">
                        ${testsHTML}
                    </div>
                </div>`;
            diagnoseListContainer.insertAdjacentHTML('beforeend', cardHTML);
        });
    }
    
    document.getElementById('diagnosePatientList').addEventListener('click', (e) => {
        const button = e.target.closest('.primary-btn[data-patient-id]');
        if (button) {
            const patientId = button.dataset.patientId;
            const testCode = button.dataset.testCode;
            openDiagnoseModal(patientId, testCode);
        }
    });

    // --- DIAGNOSE MODAL LOGIC (UPDATED) ---
    const diagnoseModal = document.getElementById('diagnoseModal');
    const closeDiagnoseModalBtn = document.getElementById('closeDiagnoseModalBtn');
    const cancelDiagnoseBtn = document.getElementById('cancelDiagnoseBtn');
    const saveDiagnoseBtn = document.getElementById('saveDiagnoseBtn');

    function openDiagnoseModal(patientId, testCode) {
        const patient = patientDataStore[patientId];
        const mainTest = mainTestsDB[testCode];
        const parameters = subTestsDB[testCode] || [];

        document.getElementById('diagPatientName').textContent = patient.name;
        document.getElementById('diagPatientAgeSex').textContent = `${patient.age} / ${patient.gender}`;
        document.getElementById('diagTestName').textContent = `${mainTest.name} (${mainTest.code})`;
        document.getElementById('diagPatientId').value = patientId;
        document.getElementById('diagTestCode').value = testCode;

        const formBody = document.getElementById('diagnoseFormBody');
        formBody.innerHTML = ''; 

        const existingResults = patientResultsDB[patientId]?.[testCode]?.results || {};

        if (mainTest.type === 'LAB') {
            if (parameters.length > 0) {
                formBody.innerHTML = `
                    <div class="diagnose-lab-grid header">
                        <span>Parameter</span>
                        <span>Result</span>
                        <span>Units</span>
                        <span>Reference Range</span>
                    </div>`;
                
                parameters.forEach(param => {
                    const paramId = `param-${param.name.replace(/\s+/g, '-')}`;
                    const row = document.createElement('div');
                    row.className = 'diagnose-lab-grid';
                    row.innerHTML = `
                        <label for="${paramId}">${param.name}</label>
                        <input type="text" id="${paramId}" name="${param.name}" value="${existingResults[param.name] || ''}" placeholder="Enter value">
                        <span>${param.units || ''}</span>
                        <span>${param.refRange || ''}</span>`;
                    formBody.appendChild(row);
                });
            } else {
                 formBody.innerHTML = `
                    <div class="form-group">
                        <label for="result-value">${mainTest.name} Result</label>
                        <input type="text" id="result-value" name="result" value="${existingResults['result'] || ''}">
                    </div>`;
            }
        } else if (mainTest.type === 'CUL') {
            formBody.innerHTML = `
                <div class="diagnose-culture-grid">
                    <div class="form-group">
                        <label for="cul-organism">Organism Isolated</label>
                        <input type="text" id="cul-organism" name="Organism Isolated" value="${existingResults['Organism Isolated'] || ''}">
                    </div>
                    <div class="form-group">
                        <label for="cul-colony">Colony Count</label>
                        <input type="text" id="cul-colony" name="Colony Count" value="${existingResults['Colony Count'] || ''}">
                    </div>
                    <div class="form-group form-group-full">
                         <label for="cul-sensitivity">Sensitivity Report</label>
                        <textarea id="cul-sensitivity" name="Sensitivity Report" rows="6">${existingResults['Sensitivity Report'] || ''}</textarea>
                    </div>
                </div>`;
        }
        diagnoseModal.classList.add('active');
    }
    
    function closeDiagnoseModal() {
        diagnoseModal.classList.remove('active');
    }
    
    saveDiagnoseBtn.addEventListener('click', () => {
        const patientId = document.getElementById('diagPatientId').value;
        const testCode = document.getElementById('diagTestCode').value;
        const form = document.getElementById('diagnoseForm');
        const formData = new FormData(form);
        const results = {};
        for (let [key, value] of formData.entries()) {
            results[key] = value;
        }

        if (!patientResultsDB[patientId]) {
            patientResultsDB[patientId] = {};
        }
        patientResultsDB[patientId][testCode] = {
            results: results,
            status: 'complete'
        };
        
        closeDiagnoseModal();
        renderDiagnoseList();
    });

    closeDiagnoseModalBtn.addEventListener('click', closeDiagnoseModal);
    cancelDiagnoseBtn.addEventListener('click', closeDiagnoseModal);
    
    // --- PDF RECEIPT GENERATION (UPDATED LAYOUT) ---
    function getReceiptHTML(patientId, isPreview = false) {
        const patient = isPreview ? {id: 1, name: "John Doe", age: 45, gender: "Male", referral: "SELF", paymentMode: "CASH", discount: 10, paidAmount: 140, contact: '9876543210'} : patientDataStore[patientId];
        const tests = isPreview ? [{name: "Sample Test 1", cost: 100}, {name: "Sample Test 2", cost: 50}] : patientTestsDB[patientId] || [];
        const receiptDate = new Date();
        const formattedDate = `${receiptDate.getDate().toString().padStart(2, '0')}/${(receiptDate.getMonth() + 1).toString().padStart(2, '0')}/${receiptDate.getFullYear()}`;
        const formattedTime = receiptDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        const subTotal = tests.reduce((sum, test) => sum + test.cost, 0);
        const payableAmt = subTotal - (patient.discount || 0);
        const balanceAmt = payableAmt - (patient.paidAmount || 0);
        
        let testRows = '';
        tests.forEach((test, index) => {
            testRows += `
                <tr>
                    <td style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px;">${index + 1}</td>
                    <td style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px;">${test.name}</td>
                    <td style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px; text-align: right;">${test.cost.toFixed(2)}</td>
                </tr>`;
        });

        return `
            <div id="receiptContent" style="width: 100%; font-family: sans-serif; font-size: ${receiptSettings.fontSize}px; color: #000; display: flex; flex-direction: column; justify-content: space-between; min-height: 98%;">
                <div>
                    <div class="header" style="text-align: ${receiptSettings.textAlign}; margin-bottom: 0.5rem; border-bottom: 1px solid #000; padding-bottom: 0.5rem;">
                        <h1 style="margin: 0; font-size: 1.8em; font-weight: bold;">BABA DEEP SINGH CHARITABLE LABORATORY</h1>
                        <p style="margin: 2px 0; font-size: 0.9em;">JAWADDI ROAD, MODEL TOWN, LUDHIANA Ph.no: 0161-4056571</p>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.9em;">
                        <tbody>
                            <tr>
                                <td style="padding: 1px 5px 1px 0; white-space: nowrap;"><strong>Receipt No.</strong>:</td>
                                <td style="padding: 1px 5px;">${isPreview ? 'BDXXXX/XXXX' : `BD${receiptNoCounter}/${receiptNoCounter++}`}</td>
                                <td style="padding: 1px 5px; white-space: nowrap;"><strong>Receipt Date</strong>:</td>
                                <td style="padding: 1px 0;">${formattedDate}</td>
                            </tr>
                            <tr>
                                <td style="padding: 1px 5px 1px 0;"><strong>Patient Name</strong>:</td>
                                <td style="padding: 1px 5px;">${patient.name}</td>
                                <td style="padding: 1px 5px;"><strong>Age/Sex</strong>:</td>
                                <td style="padding: 1px 0;">${patient.age}Years / ${patient.gender.toUpperCase()}</td>
                            </tr>
                             <tr>
                                <td style="padding: 1px 5px 1px 0;"><strong>Referral</strong>:</td>
                                <td style="padding: 1px 5px;">${patient.referral}</td>
                                 <td style="padding: 1px 5px;"><strong>Lab Panel</strong>:</td>
                                <td style="padding: 1px 0;">BABA DEEP SINGH CHARITABLE LABORATORY</td>
                            </tr>
                            <tr>
                                <td style="padding: 1px 5px 1px 0;"><strong>Mode</strong>:</td>
                                <td style="padding: 1px 5px;">${patient.paymentMode}</td>
                                <td style="padding: 1px 5px;"><strong>Mobile</strong>:</td>
                                <td style="padding: 1px 0;">${patient.contact || 'N/A'}</td>
                            </tr>
                             <tr>
                                <td style="padding: 1px 5px 1px 0;"><strong>Address</strong>:</td>
                                <td style="padding: 1px 5px;"></td>
                                <td style="padding: 1px 5px;"><strong>Patient ID</strong>:</td>
                                <td style="padding: 1px 0;">${patient.id}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.9em;">
                        <thead>
                            <tr>
                                <th style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px; text-align: left; font-weight: bold;">S.No</th>
                                <th style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px; text-align: left; font-weight: bold;">Test Description</th>
                                <th style="border: 1px solid #000; padding: ${receiptSettings.tableCellPadding}px; text-align: right; font-weight: bold;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${testRows}</tbody>
                    </table>
                </div>

                <div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                         <tbody>
                            <tr>
                                <td style="padding: 1px 0; vertical-align: top;"><strong>In words:</strong> ${numberToWords(payableAmt)} Only</td>
                                <td style="padding: 1px 0; text-align: right;"><strong>Sub Total:</strong></td>
                                <td style="padding: 1px 0; width: 80px; text-align: right;">${subTotal.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 1px 0;"><strong>Remarks:</strong></td>
                                <td style="padding: 1px 0; text-align: right;"><strong>Payable Amt:</strong></td>
                                <td style="padding: 1px 0; text-align: right;">${payableAmt.toFixed(2)}</td>
                            </tr>
                             <tr>
                                <td style="padding: 1px 0;"></td>
                                <td style="padding: 1px 0; text-align: right;"><strong>Paid Amt:</strong></td>
                                <td style="padding: 1px 0; text-align: right;">${(patient.paidAmount || 0).toFixed(2)}</td>
                            </tr>
                             <tr>
                                <td style="padding: 1px 0; font-size: 0.9em;">Printed: ${formattedDate} ${formattedTime}</td>
                                <td style="padding: 1px 0; text-align: right;"><strong>Balance Amt:</strong></td>
                                <td style="padding: 1px 0; text-align: right;">${balanceAmt.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div style="margin-top: 2rem; border-top: 1px solid #000; padding-top: 0.5rem; font-size: 0.85em;">
                        <p style="margin: 2px 0;">1. There is No Provision, for CASH refund after billing.</p>
                        <p style="margin: 2px 0;">2. All Bill Settlements will be done by CHEQUE/Account Transfer in direct Account of Patient</p>
                        <div style="text-align: right; margin-top: 1.5rem;">
                           <strong>Auth Signatory [admin]</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function printPatientReceipt(patientId) {
        const element = document.createElement('div');
        element.innerHTML = getReceiptHTML(patientId);
        const patientName = patientDataStore[patientId].name;
        const opt = {
            margin: [ parseFloat(receiptSettings.marginTop), parseFloat(receiptSettings.marginRight), parseFloat(receiptSettings.marginBottom), parseFloat(receiptSettings.marginLeft) ],
            filename: `Receipt-${patientName.replace(/\s+/g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: [parseFloat(receiptSettings.receiptWidth), parseFloat(receiptSettings.receiptHeight)], orientation: 'portrait' }
        };
        html2pdf().from(element.querySelector('#receiptContent')).set(opt).save();
    }
    
    // --- SETTINGS PAGE LOGIC ---
    function updateReceiptPreview() {
        const previewBox = document.getElementById('receiptPreview');
        const previewHTML = getReceiptHTML(null, true);
        const container = document.createElement('div');
        container.innerHTML = previewHTML;
        const content = container.querySelector('#receiptContent');
        content.style.width = `${receiptSettings.receiptWidth}mm`;
        content.style.minHeight = `${receiptSettings.receiptHeight}mm`;
        content.style.border = '1px solid #ccc';
        previewBox.innerHTML = '';
        previewBox.appendChild(content);
    }
    document.querySelectorAll('.receipt-style-input').forEach(input => {
        input.addEventListener('input', (e) => {
            receiptSettings[e.target.id] = e.target.value;
            updateReceiptPreview();
        });
    });

    // --- TEST & OTHER INITIALIZATION ---
    const testDetailsModal = document.getElementById('testDetailsModal');
    function showTestDetails(patientId) {
        const patient = patientDataStore[patientId];
        document.getElementById('detailsPatientName').textContent = patient.name;
        document.getElementById('detailsPatientId').textContent = `ID: ${patient.id}`;
        renderPatientTests(patientId);
        testDetailsModal.classList.add('active');
    }
    function renderPatientTests(patientId) {
        const tableBody = document.getElementById('patientTestsTableBody');
        const tests = patientTestsDB[patientId] || [];
        tableBody.innerHTML = '';
        tests.forEach((test, index) => {
            const row = tableBody.insertRow();
            row.innerHTML = `<td>${test.code}</td><td>${test.name}</td><td><button class="remove-btn" data-patient-id="${patientId}" data-index="${index}">&times;</button></td>`;
        });
    }
    document.getElementById('patientTestsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.remove-btn');
        if (btn) {
            const patientId = btn.dataset.patientId;
            const testIndex = btn.dataset.index;
            patientTestsDB[patientId].splice(testIndex, 1);
            renderPatientTests(patientId);
        }
    });
    document.getElementById('closeTestDetailsBtn').addEventListener('click', () => testDetailsModal.classList.remove('active'));
    document.getElementById('cancelTestDetailsBtn').addEventListener('click', () => testDetailsModal.classList.remove('active'));
    document.getElementById('st-main-code').addEventListener('blur', (e) => {
        const code = e.target.value.toUpperCase();
        document.getElementById('st-main-name').value = mainTestsDB[code] ? mainTestsDB[code].name : '';
    });
    document.getElementById('mainTestTableBody').addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const previouslySelected = document.querySelector('#mainTestTableBody .selected-row');
        if (row === previouslySelected) {
            row.classList.remove('selected-row');
            renderSubTests(null);
        } else {
            if (previouslySelected) {
                previouslySelected.classList.remove('selected-row');
            }
            row.classList.add('selected-row');
            const mainCode = row.cells[0].textContent;
            renderSubTests(mainCode);
        }
    });
    const getDailySrNo = () => {
        const today = new Date().toISOString().slice(0, 10);
        if (today !== lastResetDate) { dailySrNoCounter = 1; lastResetDate = today; }
        return dailySrNoCounter++;
    };
    function numberToWords(num) {
        if (num === 0) return 'Zero';
        const a = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
        const b = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];
        if ((num = num.toString()).length > 9) return 'overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return ''; var str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return str.trim().replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.substr(1)).join(' ');
    };
    
    initialize();
});

