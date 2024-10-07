function initJotFormAutofill() {
    const JOTFORM_API_KEY = window.JOTFORM_API_KEY;
    const GOOGLE_SHEETS_API_KEY = window.GOOGLE_SHEETS_API_KEY;

    if (!JOTFORM_API_KEY || !GOOGLE_SHEETS_API_KEY) {
        console.error("API keys not found. Make sure to set them in the bookmarklet.");
        return;
    }

    const FORM_ID = '241013857416150';
    const JOTFORM_BASE_URL = 'https://hipaa-api.jotform.com/v1';
    const GOOGLE_SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

    // Function to fetch data from Google Sheets
    async function fetchFromGoogleSheets(spreadsheetId, range) {
        const url = `${GOOGLE_SHEETS_BASE_URL}/${spreadsheetId}/values/${range}?key=${GOOGLE_SHEETS_API_KEY}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            return data.values;
        }
        throw new Error('Failed to fetch data from Google Sheets');
    }

    // Function to fetch submissions from JotForm
    async function getSubmissions() {
        const url = `${JOTFORM_BASE_URL}/form/${FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}&limit=500&orderby=created_at`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            return data.content;
        }
        return [];
    }

    // Function to create UI
    function createUI() {
        const container = document.createElement('div');
        container.id = 'jotform-autofill-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 10px;
            z-index: 10000;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        `;
        const header = document.createElement('h3');
        header.textContent = 'JotForm Autofill';
        header.style.marginTop = '0';
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'jotform-autofill-loading';
        loadingMessage.textContent = 'Retrieving Previous Jotform Submissions. Please Wait...';
        loadingMessage.style.cssText = `
            margin-bottom: 10px;
            font-weight: bold;
            text-align: center;
        `;
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.id = 'jotform-autofill-filter';
        filterInput.placeholder = 'Filter by name...';
        filterInput.style.width = '100%';
        filterInput.style.marginBottom = '10px';
        filterInput.style.display = 'none'; // Hide initially
        const submissionsList = document.createElement('ul');
        submissionsList.id = 'jotform-autofill-submissions';
        submissionsList.style.cssText = `
            list-style-type: none;
            padding: 0;
            max-height: 300px;
            overflow-y: auto;
            display: none; // Hide initially
        `;
        const statusMessage = document.createElement('div');
        statusMessage.id = 'jotform-autofill-status';
        statusMessage.style.cssText = `
            margin-top: 10px;
            font-weight: bold;
            text-align: center;
        `;
        container.appendChild(header);
        container.appendChild(loadingMessage);
        container.appendChild(filterInput);
        container.appendChild(submissionsList);
        container.appendChild(statusMessage);
        document.body.appendChild(container);
        return { filterInput, submissionsList, statusMessage, container, loadingMessage };
    }

    // Function to get and display submissions
    async function getAndDisplaySubmissions() {
        const { filterInput, submissionsList, statusMessage, container, loadingMessage } = createUI();
        try {
            const submissions = await getSubmissions();
            loadingMessage.style.display = 'none'; // Hide loading message
            filterInput.style.display = 'block'; // Show filter input
            submissionsList.style.display = 'block'; // Show submissions list
            displaySubmissions(submissions, submissionsList, statusMessage, container);
            filterInput.addEventListener('input', () => {
                const filteredSubmissions = filterSubmissions(submissions, filterInput.value);
                displaySubmissions(filteredSubmissions, submissionsList, statusMessage, container);
            });
        } catch (error) {
            console.error('Error:', error);
            if (loadingMessage) {
                loadingMessage.textContent = 'Error: Could not fetch submissions.';
            }
        }
    }

    // Function to display submissions
    function displaySubmissions(submissions, listElement, statusMessage, container) {
        listElement.innerHTML = '';
        submissions.forEach(submission => {
            const name = getNameFromSubmission(submission);
            const date = formatDate(submission.created_at);
            const li = document.createElement('li');
            li.textContent = `${name} - ${date}`;
            li.style.cursor = 'pointer';
            li.style.padding = '5px';
            li.addEventListener('mouseover', () => { li.style.backgroundColor = '#f0f0f0'; });
            li.addEventListener('mouseout', () => { li.style.backgroundColor = 'transparent'; });
            li.addEventListener('click', async () => {
                if (statusMessage) {
                    statusMessage.textContent = 'Autofill Initiated. Please wait a moment.';
                }
                await autofillForm(submission);
                if (statusMessage) {
                    statusMessage.textContent = 'Autofill Complete.';
                }
                setTimeout(() => {
                    if (container && container.parentNode) {
                        container.parentNode.removeChild(container);
                    }
                }, 2000);
            });
            listElement.appendChild(li);
        });
    }

    function filterSubmissions(submissions, filter) {
        return submissions.filter(submission => {
            const name = getNameFromSubmission(submission);
            return name.toLowerCase().includes(filter.toLowerCase());
        });
    }

    function formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    function getNameFromSubmission(submission) {
        if (submission.answers && submission.answers['3'] && submission.answers['3'].prettyFormat) {
            return submission.answers['3'].prettyFormat;
        } else if (submission.answers && submission.answers['3'] && submission.answers['3'].answer) {
            const { first, last } = submission.answers['3'].answer;
            return `${first || ''} ${last || ''}`.trim();
        }
        return 'Unknown';
    }

    // Autofill form function
    async function autofillForm(submission) {
        console.log("Starting autofill with submission:", submission);

        // Helper function to safely access nested properties
        const safeGet = (obj, path) => {
            return path.split('.').reduce((acc, part) => acc && acc[part], obj);
        };

        // Helper function to fill input if value exists and element is visible
        const fillIfExistsAndVisible = (name, value) => {
            const element = document.querySelector(`[name="${name}"]`);
            if (element && value && isElementVisible(element)) {
                fillInputByName(name, value);
            }
        };

        // Helper function to check if an element is visible
        const isElementVisible = (element) => {
            return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
        };

        // Function to fill the current visible page
        const fillVisiblePage = () => {
            // New Assessment or Reassessment? (Question 164)
            const reassessmentCheckbox = document.querySelector('input[type="checkbox"][name="q164_newAssessment[]"][value="Reassessment"]');
            if (reassessmentCheckbox && isElementVisible(reassessmentCheckbox)) {
                reassessmentCheckbox.checked = true;
                reassessmentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Name
            fillIfExistsAndVisible('q3_name[first]', safeGet(submission, 'answers.3.answer.first'));
            fillIfExistsAndVisible('q3_name[last]', safeGet(submission, 'answers.3.answer.last'));
            // Address
            fillIfExistsAndVisible('q5_address[addr_line1]', safeGet(submission, 'answers.5.answer.addr_line1'));
            fillIfExistsAndVisible('q5_address[city]', safeGet(submission, 'answers.5.answer.city'));
            fillIfExistsAndVisible('q5_address[state]', safeGet(submission, 'answers.5.answer.state'));
            fillIfExistsAndVisible('q5_address[postal]', safeGet(submission, 'answers.5.answer.postal'));
            // Phone numbers
            fillIfExistsAndVisible('q6_homePhone[full]', safeGet(submission, 'answers.6.prettyFormat'));
            fillIfExistsAndVisible('q7_cellPhone[full]', safeGet(submission, 'answers.7.prettyFormat'));
            // Email
            fillIfExistsAndVisible('q8_email', safeGet(submission, 'answers.8.answer'));

            // Date of Birth
            const dobInput = document.getElementById('lite_mode_9');
            if (dobInput && isElementVisible(dobInput)) {
                const dobValue = safeGet(submission, 'answers.9.prettyFormat');
                fillDateById('lite_mode_9', dobValue);
            }

            // Gender
            selectRadioByNameIfVisible('q10_gender', safeGet(submission, 'answers.10.answer'));
            // Race/Ethnicity
            selectRadioByNameIfVisible('q21_raceethnicity', safeGet(submission, 'answers.21.answer'));

            // Emergency Contact 1
            const ec1Name = safeGet(submission, 'answers.16.prettyFormat');
            if (ec1Name) {
                const nameParts = ec1Name.split(' ');
                fillIfExistsAndVisible('q16_emergencyContact16[first]', nameParts[0]);
                fillIfExistsAndVisible('q16_emergencyContact16[last]', nameParts.slice(1).join(' '));
            }
            fillIfExistsAndVisible('q17_homePhone17[full]', safeGet(submission, 'answers.17.prettyFormat'));
            fillIfExistsAndVisible('q18_cellPhone18[full]', safeGet(submission, 'answers.18.prettyFormat'));
            fillIfExistsAndVisible('q20_relationship', safeGet(submission, 'answers.20.answer'));

            // Emergency Contact 2
            const ec2Name = safeGet(submission, 'answers.24.prettyFormat');
            if (ec2Name) {
                const nameParts = ec2Name.split(' ');
                fillIfExistsAndVisible('q24_emergencyContact[first]', nameParts[0]);
                fillIfExistsAndVisible('q24_emergencyContact[last]', nameParts.slice(1).join(' '));
            }
            fillIfExistsAndVisible('q25_input25[full]', safeGet(submission, 'answers.25.prettyFormat'));
            fillIfExistsAndVisible('q26_input26[full]', safeGet(submission, 'answers.26.prettyFormat'));
            fillIfExistsAndVisible('q28_relationship28', safeGet(submission, 'answers.28.answer'));

            // Other meals provider
            selectRadioByNameIfVisible('q29_areYou', safeGet(submission, 'answers.29.answer'));

            // Health conditions
            const healthConditions = safeGet(submission, 'answers.31.answer');
            if (healthConditions && typeof healthConditions === 'object') {
                const selectedConditions = Object.keys(healthConditions)
                    .filter(key => healthConditions[key] === true)
                    .map(key => key.replace(/_/g, ' '));
                fillCheckboxesByNameIfVisible('q31_checkHealth', selectedConditions);
            }

            // Mental Illness
            fillIfExistsAndVisible('q34_mentalIllness', safeGet(submission, 'answers.34.answer'));
            // Severity of Dementia
            selectRadioByNameIfVisible('q36_severityOf', safeGet(submission, 'answers.36.answer'));
            // Others in home
            selectRadioByNameIfVisible('q37_isThere', safeGet(submission, 'answers.37.answer'));
            // Employed
            selectRadioByNameIfVisible('q38_areYou38', safeGet(submission, 'answers.38.answer'));
            // Recent diagnosis
            fillIfExistsAndVisible('q41_haveYou', safeGet(submission, 'answers.41.answer'));

            // Medical devices
            const medicalDevices = safeGet(submission, 'answers.42.prettyFormat');
            if (medicalDevices) {
                fillCheckboxesByNameIfVisible('q42_medicalDevices', medicalDevices.split('; '));
            }

            // Need medical alert
            selectRadioByNameIfVisible('q43_doYou', safeGet(submission, 'answers.43.answer'));
            // Feeling depressed
            selectRadioByNameIfVisible('q44_haveYou44', safeGet(submission, 'answers.44.answer'));
            // Interested in talking
            selectRadioByNameIfVisible('q45_wouldYou', safeGet(submission, 'answers.45.answer'));
            // Primary care physician
            fillIfExistsAndVisible('q46_whoIs', safeGet(submission, 'answers.46.answer'));
            fillIfExistsAndVisible('q48_input48[full]', safeGet(submission, 'answers.48.prettyFormat'));
            // Holocaust survivor
            selectRadioByNameIfVisible('q49_areYou49', safeGet(submission, 'answers.49.answer'));
            // Nazi occupied territory
            fillIfExistsAndVisible('q52_whichNazi52', safeGet(submission, 'answers.52.answer'));
            // Rabbi or congregation
            selectRadioByNameIfVisible('q51_doYou51', safeGet(submission, 'answers.51.answer'));
            fillIfExistsAndVisible('q50_nameOf', safeGet(submission, 'answers.50.answer'));
            // Adequate storage
            selectRadioByNameIfVisible('q53_doesThe', safeGet(submission, 'answers.53.answer'));
            // Can operate appliances
            selectRadioByNameIfVisible('q54_doesAny', safeGet(submission, 'answers.54.answer'));
            // Household maintenance needs
            fillIfExistsAndVisible('q57_doYou57', safeGet(submission, 'answers.57.answer'));

            // Referrals given
            const referrals = safeGet(submission, 'answers.58.prettyFormat');
            if (referrals) {
                fillCheckboxesByNameIfVisible('q58_referralsGiven', referrals.split('; '));
            }

            // Eligibility
            const eligibility = safeGet(submission, 'answers.59.prettyFormat');
            if (eligibility) {
                fillCheckboxesByNameIfVisible('q59_eligibility', eligibility.split('; '));
            }

            // Meals eligibility
            const mealsEligibility = safeGet(submission, 'answers.60.prettyFormat');
            if (mealsEligibility) {
                fillCheckboxesByNameIfVisible('q60_mealsEligibility', mealsEligibility.split('; '));
            }

            // Relevant descriptors
            const descriptors = safeGet(submission, 'answers.61.prettyFormat');
            if (descriptors) {
                fillCheckboxesByNameIfVisible('q61_selectRelevant', descriptors.split('; '));
            }

            // Nutrition screening
            const dobInput2 = document.getElementById('lite_mode_68');
            if (dobInput2 && isElementVisible(dobInput2)) {
                const dobValue2 = safeGet(submission, 'answers.68.prettyFormat');
                fillDateById('lite_mode_68', dobValue2);
            }
            fillIfExistsAndVisible('q69_whatIs', safeGet(submission, 'answers.69.answer'));
            fillIfExistsAndVisible('q70_whatIs70', safeGet(submission, 'answers.70.answer'));
            selectRadioByNameIfVisible('q72_4Referral', safeGet(submission, 'answers.72.answer'));
            selectRadioByNameIfVisible('q74_5Are', safeGet(submission, 'answers.74.answer'));
            selectRadioByNameIfVisible('q75_6Kind', safeGet(submission, 'answers.75.answer'));

            // Eating habits
            selectRadioByNameIfVisible('q77_1Do', safeGet(submission, 'answers.77.answer'));
            selectRadioByNameIfVisible('q78_2Do', safeGet(submission, 'answers.78.answer'));
            selectRadioByNameIfVisible('q79_2Do79', safeGet(submission, 'answers.79.answer'));
            selectRadioByNameIfVisible('q80_2Do80', safeGet(submission, 'answers.80.answer'));
            selectRadioByNameIfVisible('q81_2Do81', safeGet(submission, 'answers.81.answer'));
            selectRadioByNameIfVisible('q82_2Do82', safeGet(submission, 'answers.82.answer'));
            selectRadioByNameIfVisible('q84_doYou84', safeGet(submission, 'answers.84.answer'));
            selectRadioByNameIfVisible('q85_doYou85', safeGet(submission, 'answers.85.answer'));
            selectRadioByNameIfVisible('q86_areYou86', safeGet(submission, 'answers.86.answer'));
            selectRadioByNameIfVisible('q87_doYou87', safeGet(submission, 'answers.87.answer'));
            selectRadioByNameIfVisible('q88_doYou88', safeGet(submission, 'answers.88.answer'));

            // Malnutrition screening
            selectRadioByNameIfVisible('q91_haveYou91', safeGet(submission, 'answers.91.answer'));
            const malnutritionScreening = safeGet(submission, 'answers.92.prettyFormat');
            if (malnutritionScreening) {
                fillCheckboxesByNameIfVisible('q92_1aHow', malnutritionScreening.split('; '));
            }
            selectRadioByNameIfVisible('q95_2Have', safeGet(submission, 'answers.95.answer'));

            // Food insecurity
            selectRadioByNameIfVisible('q99_1Within', safeGet(submission, 'answers.99.answer'));
            selectRadioByNameIfVisible('q100_withinThe100', safeGet(submission, 'answers.100.answer'));

            // ADL (Activities of Daily Living)
            selectRadioByNameIfVisible('q102_haveYou103', safeGet(submission, 'answers.102.answer'));
            selectRadioByNameIfVisible('q103_eating', safeGet(submission, 'answers.103.answer'));
            selectRadioByNameIfVisible('q104_dressing', safeGet(submission, 'answers.104.answer'));
            selectRadioByNameIfVisible('q105_toileting', safeGet(submission, 'answers.105.answer'));
            selectRadioByNameIfVisible('q106_continence', safeGet(submission, 'answers.106.answer'));
            selectRadioByNameIfVisible('q107_walkingtransferring', safeGet(submission, 'answers.107.answer'));

            // IADL (Instrumental Activities of Daily Living)
            selectRadioByNameIfVisible('q109_laundry', safeGet(submission, 'answers.109.answer'));
            selectRadioByNameIfVisible('q110_preparingMeals', safeGet(submission, 'answers.110.answer'));
            selectRadioByNameIfVisible('q111_ordinaryHousework', safeGet(submission, 'answers.111.answer'));
            selectRadioByNameIfVisible('q114_managingMedications', safeGet(submission, 'answers.114.answer'));
            selectRadioByNameIfVisible('q115_shopping', safeGet(submission, 'answers.115.answer'));
            selectRadioByNameIfVisible('q116_usingTransportation', safeGet(submission, 'answers.116.answer'));
            selectRadioByNameIfVisible('q117_payingBillsmanaging', safeGet(submission, 'answers.117.answer'));
            selectRadioByNameIfVisible('q118_usingTelephone', safeGet(submission, 'answers.118.answer'));

            // Nutritionist consultation
            selectRadioByNameIfVisible('q119_wouldYou119', safeGet(submission, 'answers.119.answer'));

            // Title and Date (Question 120)
            const titleInput = document.querySelector('input[name="q120_input120[shorttext-1]"]');
            if (titleInput && isElementVisible(titleInput)) {
                titleInput.value = 'SWI';
                titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const dateInput = document.querySelector('input[name="q120_input120[shorttext-2]"]');
            if (dateInput && isElementVisible(dateInput)) {
                const today = new Date();
                const formattedDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
                dateInput.value = formattedDate;
                dateInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // ADL and IADL scores
            fillIfExistsAndVisible('q159_adlScore159', safeGet(submission, 'answers.159.answer'));
            fillIfExistsAndVisible('q158_numberOf', safeGet(submission, 'answers.158.answer'));

            // Social Security and poverty line
            selectRadioByNameIfVisible('q160_areYou160', safeGet(submission, 'answers.160.answer'));
            selectRadioByNameIfVisible('q124_incomeBelow', safeGet(submission, 'answers.124.answer'));

            // Weekend/holiday support
            const weekendSupport = safeGet(submission, 'answers.166.prettyFormat');
            if (weekendSupport) {
                fillCheckboxesByNameIfVisible('q166_doYou166', [weekendSupport]);
            }

            // How happy were you with my service today? (Question 187)
            const ratingSelect = document.querySelector('select[name="q187_howHappy"]');
            if (ratingSelect && isElementVisible(ratingSelect)) {
                ratingSelect.value = '5';
                ratingSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Who Signed? (Question 195)
            const whoSigned = safeGet(submission, 'answers.195.answer');
            if (whoSigned) {
                selectRadioByNameIfVisible('q195_whoSigned', whoSigned);
            }

            // Assessment narrative
            fillIfExistsAndVisible('q122_assessmentNarrative', safeGet(submission, 'answers.122.answer'));

            // Trigger change events for all filled inputs
            document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(input => {
                if (isElementVisible(input)) {
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        };

        // Function to wait for the next button click
        const waitForNextButtonClick = () => {
            return new Promise(resolve => {
                const nextButton = document.querySelector('button.form-pagebreak-next');
                if (nextButton && isElementVisible(nextButton)) {
                    nextButton.addEventListener('click', resolve, { once: true });
                } else {
                    // If there's no next button, resolve immediately
                    resolve();
                }
            });
        };

        // Main autofill loop
        const autofillLoop = async () => {
            fillVisiblePage();
            console.log("Filled visible page. Waiting for user to click 'Next'...");
            
            await waitForNextButtonClick();
            
            // Wait a bit for the next page to load
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if there are more visible fields to fill
            const visibleInputs = document.querySelectorAll('input:not([type="hidden"]):not([value]), select:not([value]), textarea:not(:empty)');
            if (visibleInputs.length > 0) {
                await autofillLoop();
            } else {
                console.log("Autofill completed");
            }
        };

        // Start the autofill process
        await autofillLoop();
    }

    // Helper functions
    function fillInputByName(name, value) {
        const input = document.querySelector(`[name="${name}"]`);
        if (input) input.value = value;
    }

    function selectRadioByNameIfVisible(name, value) {
        if (value) {
            const radio = document.querySelector(`[name="${name}"][value="${value}"]`);
            if (radio && isElementVisible(radio)) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    function fillCheckboxesByNameIfVisible(name, values) {
        if (!Array.isArray(values)) {
            console.warn(`Expected array for checkbox values, got: ${typeof values}`);
            return;
        }
        values.forEach(value => {
            const checkbox = document.querySelector(`input[type="checkbox"][name="${name}[]"][value="${value.replace(/"/g, '\\"')}"]`);
            if (checkbox && isElementVisible(checkbox)) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    function fillDateById(id, dateString) {
        if (!dateString) return;
        const input = document.getElementById(id);
        if (input && isElementVisible(input)) {
            input.value = dateString;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function isElementVisible(element) {
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    // Start the application
    getAndDisplaySubmissions();
}
