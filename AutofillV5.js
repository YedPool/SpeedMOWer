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

        // Modify the createUI function
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
  
       // Modify the getAndDisplaySubmissions function
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


        
 // Modify the displaySubmissions function
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

            // Helper function to fill input if value exists
            const fillIfExists = (name, value) => {
                if (value) fillInputByName(name, value);
            };
            
            // New Assessment or Reassessment? (Question 164)
            const reassessmentCheckbox = document.querySelector('input[type="checkbox"][name="q164_newAssessment[]"][value="Reassessment"]');
            if (reassessmentCheckbox) {
                reassessmentCheckbox.checked = true;
                reassessmentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                console.warn('Reassessment checkbox not found');
            }
            
            // Name
            fillIfExists('q3_name[first]', safeGet(submission, 'answers.3.answer.first'));
            fillIfExists('q3_name[last]', safeGet(submission, 'answers.3.answer.last'));

            // Address
            fillIfExists('q5_address[addr_line1]', safeGet(submission, 'answers.5.answer.addr_line1'));
            fillIfExists('q5_address[city]', safeGet(submission, 'answers.5.answer.city'));
            fillIfExists('q5_address[state]', safeGet(submission, 'answers.5.answer.state'));
            fillIfExists('q5_address[postal]', safeGet(submission, 'answers.5.answer.postal'));

            // Phone numbers
            fillIfExists('q6_homePhone[full]', safeGet(submission, 'answers.6.prettyFormat'));
            fillIfExists('q7_cellPhone[full]', safeGet(submission, 'answers.7.prettyFormat'));

            // Email
            fillIfExists('q8_email', safeGet(submission, 'answers.8.answer'));

            console.log('Attempting to fill Date of Birth (q9)');
            const dobValue1 = safeGet(submission, 'answers.9.prettyFormat');
            fillDateById('lite_mode_9', dobValue1);

            // Gender
            selectRadioByName('q10_gender', safeGet(submission, 'answers.10.answer'));

            // Race/Ethnicity
            selectRadioByName('q21_raceethnicity', safeGet(submission, 'answers.21.answer'));

            // Emergency Contact 1
            const ec1Name = safeGet(submission, 'answers.16.prettyFormat');
            if (ec1Name) {
                const nameParts = ec1Name.split(' ');
                fillInputByName('q16_emergencyContact16[first]', nameParts[0]);
                fillInputByName('q16_emergencyContact16[last]', nameParts.slice(1).join(' '));
            }
            fillIfExists('q17_homePhone17[full]', safeGet(submission, 'answers.17.prettyFormat'));
            fillIfExists('q18_cellPhone18[full]', safeGet(submission, 'answers.18.prettyFormat'));
            fillIfExists('q20_relationship', safeGet(submission, 'answers.20.answer'));

            // Emergency Contact 2
            const ec2Name = safeGet(submission, 'answers.24.prettyFormat');
            if (ec2Name) {
                const nameParts = ec2Name.split(' ');
                fillInputByName('q24_emergencyContact[first]', nameParts[0]);
                fillInputByName('q24_emergencyContact[last]', nameParts.slice(1).join(' '));
            }
            fillIfExists('q25_input25[full]', safeGet(submission, 'answers.25.prettyFormat'));
            fillIfExists('q26_input26[full]', safeGet(submission, 'answers.26.prettyFormat'));
            fillIfExists('q28_relationship28', safeGet(submission, 'answers.28.answer'));

            // Other meals provider
            selectRadioByName('q29_areYou', safeGet(submission, 'answers.29.answer'));

    // Health conditions (Question 31)
    console.log('Health conditions data:', JSON.stringify(submission.answers[31], null, 2));
    const healthConditions = safeGet(submission, 'answers.31.answer');
    if (healthConditions && typeof healthConditions === 'object') {
        const selectedConditions = Object.keys(healthConditions)
            .filter(key => healthConditions[key] === true)
            .map(key => key.replace(/_/g, ' ')); // Replace underscores with spaces
        fillCheckboxesByName('q31_checkHealth', selectedConditions);
    }

            // Mental Illness
            fillIfExists('q34_mentalIllness', safeGet(submission, 'answers.34.answer'));

            // Severity of Dementia
            selectRadioByName('q36_severityOf', safeGet(submission, 'answers.36.answer'));

            // Others in home
            selectRadioByName('q37_isThere', safeGet(submission, 'answers.37.answer'));

            // Employed
            selectRadioByName('q38_areYou38', safeGet(submission, 'answers.38.answer'));

            // Recent diagnosis
            fillIfExists('q41_haveYou', safeGet(submission, 'answers.41.answer'));

            // Medical devices
            const medicalDevices = safeGet(submission, 'answers.42.prettyFormat');
            if (medicalDevices) {
                fillCheckboxesByName('q42_medicalDevices', medicalDevices.split('; '));
            }

            // Need medical alert
            selectRadioByName('q43_doYou', safeGet(submission, 'answers.43.answer'));

            // Feeling depressed
            selectRadioByName('q44_haveYou44', safeGet(submission, 'answers.44.answer'));

            // Interested in talking
            selectRadioByName('q45_wouldYou', safeGet(submission, 'answers.45.answer'));

            // Primary care physician
            fillIfExists('q46_whoIs', safeGet(submission, 'answers.46.answer'));
            fillIfExists('q48_input48[full]', safeGet(submission, 'answers.48.prettyFormat'));

            // Holocaust survivor
            selectRadioByName('q49_areYou49', safeGet(submission, 'answers.49.answer'));

            // Nazi occupied territory
            fillIfExists('q52_whichNazi52', safeGet(submission, 'answers.52.answer'));

            // Rabbi or congregation
            selectRadioByName('q51_doYou51', safeGet(submission, 'answers.51.answer'));
            fillIfExists('q50_nameOf', safeGet(submission, 'answers.50.answer'));

            // Adequate storage
            selectRadioByName('q53_doesThe', safeGet(submission, 'answers.53.answer'));

            // Can operate appliances
            selectRadioByName('q54_doesAny', safeGet(submission, 'answers.54.answer'));

            // Household maintenance needs
            fillIfExists('q57_doYou57', safeGet(submission, 'answers.57.answer'));

            // Referrals given
            const referrals = safeGet(submission, 'answers.58.prettyFormat');
            if (referrals) {
                fillCheckboxesByName('q58_referralsGiven', referrals.split('; '));
            }

            // Eligibility
            const eligibility = safeGet(submission, 'answers.59.prettyFormat');
            if (eligibility) {
                fillCheckboxesByName('q59_eligibility', eligibility.split('; '));
            }

            // Meals eligibility
            const mealsEligibility = safeGet(submission, 'answers.60.prettyFormat');
            if (mealsEligibility) {
                fillCheckboxesByName('q60_mealsEligibility', mealsEligibility.split('; '));
            }

            // Relevant descriptors
            const descriptors = safeGet(submission, 'answers.61.prettyFormat');
            if (descriptors) {
                fillCheckboxesByName('q61_selectRelevant', descriptors.split('; '));
            }

            // Nutrition screening
            console.log('Attempting to fill Date of Birth (q68)');
            const dobValue2 = safeGet(submission, 'answers.68.prettyFormat');
            fillDateById('lite_mode_68', dobValue2);

            fillIfExists('q69_whatIs', safeGet(submission, 'answers.69.answer'));
            fillIfExists('q70_whatIs70', safeGet(submission, 'answers.70.answer'));
            selectRadioByName('q72_4Referral', safeGet(submission, 'answers.72.answer'));
            selectRadioByName('q74_5Are', safeGet(submission, 'answers.74.answer'));


            
            // Eating habits
            selectRadioByName('q77_1Do', safeGet(submission, 'answers.77.answer'));
            selectRadioByName('q78_2Do', safeGet(submission, 'answers.78.answer'));
            selectRadioByName('q79_2Do79', safeGet(submission, 'answers.79.answer'));
            selectRadioByName('q80_2Do80', safeGet(submission, 'answers.80.answer'));
            selectRadioByName('q81_2Do81', safeGet(submission, 'answers.81.answer'));
            selectRadioByName('q82_2Do82', safeGet(submission, 'answers.82.answer'));
            selectRadioByName('q84_doYou84', safeGet(submission, 'answers.84.answer'));
            selectRadioByName('q85_doYou85', safeGet(submission, 'answers.85.answer'));
            selectRadioByName('q86_areYou86', safeGet(submission, 'answers.86.answer'));
            selectRadioByName('q87_doYou87', safeGet(submission, 'answers.87.answer'));
            selectRadioByName('q88_doYou88', safeGet(submission, 'answers.88.answer'));

            // Malnutrition screening
            selectRadioByName('q91_haveYou91', safeGet(submission, 'answers.91.answer'));
            const malnutritionScreening = safeGet(submission, 'answers.92.prettyFormat');
            if (malnutritionScreening) {
                fillCheckboxesByName('q92_1aHow', malnutritionScreening.split('; '));
            }
            selectRadioByName('q95_2Have', safeGet(submission, 'answers.95.answer'));

            // Food insecurity
            selectRadioByName('q99_1Within', safeGet(submission, 'answers.99.answer'));
            selectRadioByName('q100_withinThe100', safeGet(submission, 'answers.100.answer'));

            // ADL (Activities of Daily Living)
            selectRadioByName('q102_haveYou103', safeGet(submission, 'answers.102.answer'));
            selectRadioByName('q103_eating', safeGet(submission, 'answers.103.answer'));
            selectRadioByName('q104_dressing', safeGet(submission, 'answers.104.answer'));
            selectRadioByName('q105_toileting', safeGet(submission, 'answers.105.answer'));
            selectRadioByName('q106_continence', safeGet(submission, 'answers.106.answer'));
            selectRadioByName('q107_walkingtransferring', safeGet(submission, 'answers.107.answer'));

            // IADL (Instrumental Activities of Daily Living)
            selectRadioByName('q109_laundry', safeGet(submission, 'answers.109.answer'));
            selectRadioByName('q110_preparingMeals', safeGet(submission, 'answers.110.answer'));
            selectRadioByName('q111_ordinaryHousework', safeGet(submission, 'answers.111.answer'));
            selectRadioByName('q114_managingMedications', safeGet(submission, 'answers.114.answer'));
            selectRadioByName('q115_shopping', safeGet(submission, 'answers.115.answer'));
            selectRadioByName('q116_usingTransportation', safeGet(submission, 'answers.116.answer'));
            selectRadioByName('q117_payingBillsmanaging', safeGet(submission, 'answers.117.answer'));
            selectRadioByName('q118_usingTelephone', safeGet(submission, 'answers.118.answer'));

            // Nutritionist consultation
            selectRadioByName('q119_wouldYou119', safeGet(submission, 'answers.119.answer'));

                // Title and Date (Question 120)
            const titleAndDate = safeGet(submission, 'answers.120.answer');
    
            // Fill in the title
              const titleInput = document.querySelector('input[name="q120_input120[shorttext-1]"]');
            if (titleInput) {
                if (titleAndDate && titleAndDate['shorttext-1']) {
                    titleInput.value = titleAndDate['shorttext-1'];
                } else {
                    titleInput.value = 'SWI'; // Default value if not present in submission
                }
                titleInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Fill in today's date
                const dateInput = document.querySelector('input[name="q120_input120[shorttext-2]"]');
                if (dateInput) {
                const today = new Date();
                const formattedDate = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;
                dateInput.value = formattedDate;
                dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
            
            // ADL and IADL scores
            fillIfExists('q159_adlScore159', safeGet(submission, 'answers.159.answer'));
            fillIfExists('q158_numberOf', safeGet(submission, 'answers.158.answer'));

            // Social Security and poverty line
            selectRadioByName('q160_areYou160', safeGet(submission, 'answers.160.answer'));
            selectRadioByName('q124_incomeBelow', safeGet(submission, 'answers.124.answer'));

            // Weekend/holiday support
            const weekendSupport = safeGet(submission, 'answers.166.prettyFormat');
            if (weekendSupport) {
                fillCheckboxesByName('q166_doYou166', [weekendSupport]);
            }

    // How happy were you with my service today? (Question 187)
    const ratingContainer = document.getElementById('input_187');
    if (ratingContainer) {
        // Find all the rating stars
        const stars = ratingContainer.querySelectorAll('.rating-item');
        if (stars.length > 0) {
            // Click the last star (highest rating)
            const lastStar = stars[stars.length - 1];
            lastStar.click();
            
            // If you want to simulate a mouse event instead of a click:
            // const event = new MouseEvent('mousedown', {
            //     view: window,
            //     bubbles: true,
            //     cancelable: true
            // });
            // lastStar.dispatchEvent(event);
        } else {
            console.warn('Rating stars not found');
        }
    } else {
        console.warn('Rating container not found');
    }
            
    // Who Signed? (Question 195)
    const whoSigned = safeGet(submission, 'answers.195.answer');
    if (whoSigned) {
        selectRadioByName('q195_whoSigned', whoSigned);
    }
            

            // Trigger change events
            document.querySelectorAll('input, select, textarea').forEach(input => {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });

            return new Promise((resolve) => {
                // Wrap the console.log in a setTimeout to ensure it runs after all the DOM updates
                setTimeout(() => {
                    console.log("Autofill completed");
                    resolve();
                }, 0);
            });
        }

        // Helper functions
        function fillInputByName(name, value) {
            const input = document.querySelector(`[name="${name}"]`);
            if (input) input.value = value;
        }

        function fillTextareaByName(name, value) {
            const textarea = document.querySelector(`[name="${name}"]`);
            if (textarea) textarea.value = value;
        }

        function selectRadioByName(name, value) {
            if (value) {
                const radio = document.querySelector(`[name="${name}"][value="${value}"]`);
                if (radio) radio.checked = true;
            }
        }

function fillCheckboxesByName(name, values) {
    if (!Array.isArray(values)) {
        console.warn(`Expected array for checkbox values, got: ${typeof values}`);
        return;
    }
    values.forEach(value => {
        // Use attribute selector to find checkbox, accounting for spaces in the value
        const checkbox = document.querySelector(`input[type="checkbox"][name="${name}[]"][value="${value.replace(/"/g, '\\"')}"]`);
        if (checkbox) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            console.warn(`Checkbox with name ${name} and value "${value}" not found`);
        }
    });
}

        function fillDateById(id, dateString) {
    console.log(`Attempting to fill date for element with id ${id} with value: ${dateString}`);
    if (!dateString) {
        console.log(`No date string provided for ${id}`);
        return;
    }

    const input = document.getElementById(id);
    if (input) {
        // Set the value
        input.value = dateString;

        // Create and dispatch events
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        const blurEvent = new Event('blur', { bubbles: true, cancelable: true });

        input.dispatchEvent(inputEvent);
        input.dispatchEvent(changeEvent);
        input.dispatchEvent(blurEvent);

        console.log(`Successfully filled date input ${id} with ${dateString}`);

        // If there's a calendar icon or trigger associated with this input, try to click it
        const calendarTrigger = input.nextElementSibling;
        if (calendarTrigger && calendarTrigger.classList.contains('calendar-trigger')) {
            calendarTrigger.click();
            setTimeout(() => {
                document.body.click(); // Close the calendar if it opened
            }, 100);
        }

        // If JotForm uses a hidden input for the actual value, try to update that as well
        const hiddenInput = document.querySelector(`input[name="${input.name}"][type="hidden"]`);
        if (hiddenInput) {
            hiddenInput.value = dateString;
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    } else {
        console.warn(`Date input field with id ${id} not found`);
    }
}


        // Start the application
        getAndDisplaySubmissions();
    };
