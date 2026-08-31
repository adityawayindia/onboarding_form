/* =========================================================
   DigiDr Onboarding Form — Behaviour & Validation
   ========================================================= */

let phoneInput;
let isRestoringDraft = false;
let formSubmitted = false;
const interactedFields = new Set();

const DRAFT_STORAGE_KEY = 'digidr_onboarding_draft';
const PHOTO_STORAGE_KEY = 'digidr_onboarding_photo';

document.addEventListener('DOMContentLoaded', function () {

  /* -------------------------------------------------------
     Phone Input (intl-tel-input) — same system as interest form
     ------------------------------------------------------- */
  const phoneField = document.querySelector('#phone');
  phoneInput = window.intlTelInput(phoneField, {
    initialCountry: 'in',
    preferredCountries: ['in', 'us', 'gb', 'ae', 'sg'],
    separateDialCode: true,
    utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js'
  });

  phoneField.addEventListener('input', function () {
    const value = this.value.replace(/\D/g, '');
    this.value = value;

    const activeCountry = phoneInput.getSelectedCountryData();
    if (activeCountry && activeCountry.iso2 === 'in') {
      if (value.length > 10) this.value = value.substring(0, 10);
    } else if (value.length > 15) {
      this.value = value.substring(0, 15);
    }
    markFieldInteracted('phone');
    validateField('phone');
  });

  phoneField.addEventListener('keypress', function (e) {
    if (e.key < '0' || e.key > '9') {
      e.preventDefault();
      return;
    }
    const value = this.value.replace(/\D/g, '');
    const activeCountry = phoneInput.getSelectedCountryData();
    if (activeCountry && activeCountry.iso2 === 'in' && value.length >= 10) {
      e.preventDefault();
    } else if (value.length >= 15) {
      e.preventDefault();
    }
  });

  phoneField.addEventListener('countrychange', function () {
    if (isRestoringDraft) return;
    if (!interactedFields.has('phone')) return;
    phoneField.value = '';
    validateField('phone');
  });

  phoneField.addEventListener('blur', () => {
    markFieldInteracted('phone');
    validateField('phone');
  });

  /* -------------------------------------------------------
     "Other" conditional text fields — cleared/validated on toggle
     ------------------------------------------------------- */
  ['otherMedicalInstitute'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      markFieldInteracted(id);
      validateField(id);
    });
  });

  /* -------------------------------------------------------
     Escape key closes the dropdown modal
     ------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDropdownModal();
      closeLegalModal();
    }
  });

  /* -------------------------------------------------------
     First Name — letters only (no digits)
     ------------------------------------------------------- */
  const firstNameField = document.getElementById('firstName');
  firstNameField.addEventListener('input', function () {
    this.value = this.value.replace(/[^A-Za-z\s'-]/g, '');
  });

  /* -------------------------------------------------------
     Profile Photo Upload
     ------------------------------------------------------- */
  const photoInput = document.getElementById('profilePhotoInput');
  const photoError = document.getElementById('photoError');

  photoInput.addEventListener('change', function () {
    const file = this.files[0];
    photoError.style.display = 'none';
    photoError.textContent = '';

    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      photoError.textContent = 'Please upload a JPG or PNG image.';
      photoError.style.display = 'block';
      this.value = '';
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = function () {
      if (img.width < 400 || img.height < 400) {
        photoError.textContent = 'Image must be at least 400×400px.';
        photoError.style.display = 'block';
        photoInput.value = '';
        URL.revokeObjectURL(objectUrl);
        return;
      }
      const dataUrl = compressImageForStorage(img);
      URL.revokeObjectURL(objectUrl);
      applyProfilePhoto(dataUrl);
      persistProfilePhoto(dataUrl);
      persistDraft();
    };
    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      photoError.textContent = 'Could not read that image. Please try another file.';
      photoError.style.display = 'block';
      photoInput.value = '';
    };
    img.src = objectUrl;
  });

  /* -------------------------------------------------------
     Wire up live validation for all fields
     ------------------------------------------------------- */
  // Note: 'aboutSection' is not listed here. It is a hidden textarea fed by
  // the rich text editor, which runs its own validation via syncRteToTextarea.
  const allFieldIds = [
    'firstName', 'email', 'gender', 'registrationCouncil', 'mciRegdNo',
    'medicalSpecialty', 'medicalSubSpecialty', 'yearsExperience',
    'qualifications',
    'medicalInstitute', 'otherMedicalInstitute',
    'clinicName', 'clinicAddress', 'pincode', 'districtCity', 'state'
  ];

  allFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      markFieldInteracted(id);
      validateField(id);
    });
    el.addEventListener('blur', () => {
      markFieldInteracted(id);
      validateField(id);
    });
  });

  const agreeTerms = document.getElementById('agreeTerms');
  agreeTerms.addEventListener('change', validateForm);

  // Set up the About Section rich text editor before any draft is
  // restored, so restored content lands in a ready editor.
  initRichTextEditor();

  restoreOnboardingDraft();

  /* Initial pass */
  validateForm();
});

/* =========================================================
   Shared Dropdown Selection Modal
   Powers every "select"-style field (gender, specialty,
   sub-specialty, years of experience, institute, state)
   using the same modal pattern as doctor_interest_form.html
   ========================================================= */
const DROPDOWN_CONFIG = {
  gender: {
    title: 'Select Gender',
    icon: 'fa-venus-mars',
    options: ['Male', 'Female', 'Other', 'Prefer not to say']
  },
  registrationCouncil: {
    title: 'Select Registration Council',
    icon: 'fa-landmark',
    allowCustom: true,
    placeholder: 'Search registration council',
    options: ['MCI', 'DCI']
  },
  medicalSpecialty: {
    title: 'Select Medical Specialty',
    icon: 'fa-stethoscope',
    options: [
      'Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'General Surgery',
      'Internal Medicine', 'Intensivist / Critical Care', 'Neurology', 'Obstetrics & Gynecology',
      'Oncology', 'Ophthalmology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
      'Radiology', 'Urology'
    ]
  },
  medicalSubSpecialty: {
    title: 'Select Medical Sub-specialty',
    icon: 'fa-bookmark',
    allowCustom: true,
    placeholder: 'Search sub-speciality',
    options: [
      'Interventional Cardiology', 'Pediatric Surgery', 'Neuro-Oncology', 'Joint Replacement',
      'Maternal-Fetal Medicine', 'Retina & Vitreous'
    ]
  },
  yearsExperience: {
    title: 'Years Of Experience',
    icon: 'fa-briefcase',
    options: buildYearsExperienceOptions()
  },
  qualifications: {
    title: 'Select Qualifications',
    icon: 'fa-graduation-cap',
    multi: true,
    allowCustom: true,
    placeholder: 'Search qualification',
    options: [
      'MBBS', 'MD', 'MS', 'DNB', 'DM', 'MCh', 'BDS', 'MDS', 'BAMS', 'BHMS', 'BUMS',
      'DGO', 'DCH', 'DA', 'DOMS', 'DLO', 'DPM', 'FRCS', 'MRCP', 'FRCP', 'FACS',
      'FICS', 'MRCOG', 'FRCR', 'PhD'
    ]
  },
  medicalInstitute: {
    title: 'Select Medical Institute',
    icon: 'fa-building-columns',
    options: [
      'AIIMS Delhi', 'CMC Vellore', 'KEM Hospital Mumbai', 'JIPMER',
      'Grant Medical College', 'Maulana Azad Medical College', 'Other'
    ],
    otherGroupId: 'otherMedicalInstituteGroup',
    otherInputId: 'otherMedicalInstitute'
  },
  state: {
    title: 'Select State',
    icon: 'fa-map-location-dot',
    options: [
      'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Gujarat', 'Haryana',
      'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan',
      'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Other'
    ]
  }
};

function buildYearsExperienceOptions() {
  const options = [{ value: 'less-than-1', label: 'Less than 1 year' }];
  for (let year = 1; year <= 40; year++) {
    options.push({ value: String(year), label: year + (year === 1 ? ' year' : ' years') });
  }
  options.push({ value: '40+', label: '40+ years' });
  return options;
}

let currentDropdownField = null;
let aboutEditMode = false;
let aboutOriginalValue = '';

/* Selected values for multi-select fields, keyed by field id */
const MULTI_SELECTIONS = {
  qualifications: []
};

function normalizeOption(opt) {
  return (typeof opt === 'object') ? opt : { value: opt, label: opt };
}

/* =========================================================
   Local storage persistence (survives refresh)
   ========================================================= */
function collectDraft() {
  const phoneField = document.getElementById('phone');
  const country = phoneInput && phoneInput.getSelectedCountryData
    ? phoneInput.getSelectedCountryData()
    : null;

  let phoneE164 = '';
  try {
    if (phoneInput && phoneInput.getNumber) phoneE164 = phoneInput.getNumber() || '';
  } catch (err) {
    phoneE164 = '';
  }

  return {
    firstName: document.getElementById('firstName').value,
    email: document.getElementById('email').value,
    phone: phoneField ? phoneField.value : '',
    phoneIso2: country && country.iso2 ? country.iso2 : 'in',
    phoneE164,
    gender: document.getElementById('gender').value,
    registrationCouncil: document.getElementById('registrationCouncil').value,
    mciRegdNo: document.getElementById('mciRegdNo').value,
    medicalSpecialty: document.getElementById('medicalSpecialty').value,
    medicalSubSpecialty: document.getElementById('medicalSubSpecialty').value,
    yearsExperience: document.getElementById('yearsExperience').value,
    qualifications: MULTI_SELECTIONS.qualifications.slice(),
    medicalInstitute: document.getElementById('medicalInstitute').value,
    otherMedicalInstitute: document.getElementById('otherMedicalInstitute').value,
    clinicName: document.getElementById('clinicName').value,
    clinicAddress: document.getElementById('clinicAddress').value,
    pincode: document.getElementById('pincode').value,
    districtCity: document.getElementById('districtCity').value,
    state: document.getElementById('state').value,
    aboutSection: document.getElementById('aboutSection').value,
    agreeTerms: document.getElementById('agreeTerms').checked
  };
}

function persistDraft() {
  if (isRestoringDraft || formSubmitted) return;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(collectDraft()));
  } catch (err) {
    console.warn('Could not save onboarding draft:', err);
  }
}

function clearPersistedDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(PHOTO_STORAGE_KEY);
  } catch (err) {
    console.warn('Could not clear onboarding draft:', err);
  }
}

function persistProfilePhoto(dataUrl) {
  if (isRestoringDraft || formSubmitted) return;
  try {
    localStorage.setItem(PHOTO_STORAGE_KEY, dataUrl);
  } catch (err) {
    console.warn('Could not save profile photo:', err);
    const photoError = document.getElementById('photoError');
    if (photoError) {
      photoError.textContent = 'Photo could not be saved locally. It may be too large.';
      photoError.style.display = 'block';
    }
  }
}

function applyProfilePhoto(dataUrl) {
  const avatarPreview = document.getElementById('avatarPreview');
  if (!avatarPreview || !dataUrl) return;
  avatarPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Profile preview';
  avatarPreview.appendChild(img);
}

function compressImageForStorage(img) {
  const maxSide = 900;
  let width = img.width;
  let height = img.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 2500000 && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

function applySingleSelect(fieldId, value, options) {
  const config = DROPDOWN_CONFIG[fieldId];
  const hiddenInput = document.getElementById(fieldId);
  const textEl = document.getElementById(fieldId + 'Text');
  if (!config || !hiddenInput || !textEl || value == null || value === '') return;

  const match = config.options
    .map(normalizeOption)
    .find(opt => String(opt.value) === String(value));
  const label = match ? match.label : value;

  hiddenInput.value = value;
  textEl.textContent = label;
  textEl.classList.remove('placeholder-text');
  textEl.classList.add('selected-text');

  if (config.otherGroupId) {
    const group = document.getElementById(config.otherGroupId);
    const input = document.getElementById(config.otherInputId);
    if (value === 'Other') {
      group.style.display = 'block';
      input.required = true;
      if (options && options.focusOther) {
        setTimeout(() => input.focus(), 100);
      }
    } else {
      group.style.display = 'none';
      input.required = false;
      input.value = '';
      clearFieldError(config.otherInputId);
    }
  }
}

function restoreOnboardingDraft() {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
  } catch (err) {
    draft = null;
  }

  const savedPhoto = localStorage.getItem(PHOTO_STORAGE_KEY);

  if (!draft && !savedPhoto) return;

  isRestoringDraft = true;

  try {
    if (draft) {
      const textIds = [
        'firstName', 'email', 'mciRegdNo',
        'clinicName', 'clinicAddress', 'pincode', 'districtCity'
      ];
      textIds.forEach(id => {
        if (typeof draft[id] === 'string') document.getElementById(id).value = draft[id];
      });

      // About Section holds HTML, so it goes through the editor
      // (which sanitizes it) rather than straight into the textarea.
      if (typeof draft.aboutSection === 'string') setRteContent(draft.aboutSection);

      ['gender', 'registrationCouncil', 'medicalSpecialty', 'medicalSubSpecialty', 'yearsExperience', 'medicalInstitute', 'state']
        .forEach(id => applySingleSelect(id, draft[id] || ''));

      if (draft.medicalInstitute === 'Other' && typeof draft.otherMedicalInstitute === 'string') {
        document.getElementById('otherMedicalInstitute').value = draft.otherMedicalInstitute;
      }

      if (Array.isArray(draft.qualifications)) {
        MULTI_SELECTIONS.qualifications = draft.qualifications.slice();
        syncMultiField('qualifications');
      }

      if (draft.phoneIso2 && phoneInput && phoneInput.setCountry) {
        phoneInput.setCountry(draft.phoneIso2);
      }
      if (typeof draft.phone === 'string') {
        document.getElementById('phone').value = draft.phone;
      }

      document.getElementById('agreeTerms').checked = !!draft.agreeTerms;
    }

    /* Always return to the main form after refresh, even if thank-you was showing */
    document.getElementById('onboardingFormContent').style.display = '';
    document.getElementById('onboardingSuccessContent').style.display = 'none';

    if (savedPhoto) applyProfilePhoto(savedPhoto);
  } finally {
    isRestoringDraft = false;
  }

  setTimeout(validateForm, 400);
}

/* Case-insensitive key used for de-duplication */
function dedupeKey(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/* -------------------------------------------------------
   Open / Close
   ------------------------------------------------------- */
function openDropdownModal(fieldId) {
  const config = DROPDOWN_CONFIG[fieldId];
  if (!config) return;

  currentDropdownField = fieldId;

  const backdrop = document.getElementById('selectModalBackdrop');
  const searchInput = document.getElementById('modalSearchInput');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitleText = document.getElementById('modalTitleText');
  const searchRow = document.getElementById('modalSearchRow');
  const searchHint = document.getElementById('modalSearchHint');

  modalIcon.className = 'fa-solid ' + config.icon;
  modalTitleText.textContent = config.title;
  searchInput.value = '';
  searchInput.placeholder = config.placeholder || 'Search...';
  searchHint.hidden = !config.allowCustom;
  searchRow.classList.toggle('no-hint', !config.allowCustom);

  resetSearchBarMode();

  renderModalChips();
  renderModalOptions(config, '');
  updateModalCloseButton();

  document.getElementById(fieldId + 'Trigger').classList.add('open');
  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => searchInput.focus(), 150);
}

function closeDropdownModal() {
  const fieldId = currentDropdownField;
  const config = fieldId ? DROPDOWN_CONFIG[fieldId] : null;

  // Never lose text the user typed but did not commit
  if (config && config.multi && config.allowCustom) {
    const leftover = document.getElementById('modalSearchInput').value;
    if (leftover.trim()) commitCustomEntries(fieldId, leftover);
  }

  const backdrop = document.getElementById('selectModalBackdrop');
  backdrop.classList.remove('active');
  document.body.style.overflow = '';

  if (fieldId) {
    const trigger = document.getElementById(fieldId + 'Trigger');
    if (trigger) trigger.classList.remove('open');
    markFieldInteracted(fieldId);
    validateField(fieldId);
  }
  currentDropdownField = null;
  resetSearchBarMode();
  updateModalCloseButton();
}

function updateModalCloseButton() {
  const btn = document.getElementById('modalCloseBtn');
  if (!btn) return;

  const showDone = currentDropdownField === 'qualifications'
    && MULTI_SELECTIONS.qualifications.length > 0;

  btn.classList.toggle('modal-done-btn', showDone);
  btn.setAttribute('aria-label', showDone ? 'Done' : 'Close');
}

function handleModalBackdropClick(e) {
  if (e.target.id === 'selectModalBackdrop') closeDropdownModal();
}

/* -------------------------------------------------------
   Search box: comma-splitting + Enter-to-add
   ------------------------------------------------------- */
function handleModalSearchInput(inputEl) {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config) return;
  renderModalOptions(config, inputEl.value);
}

function handleModalSearchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config) return;

  const inputEl = document.getElementById('modalSearchInput');
  const typed = inputEl.value.trim();
  if (!typed) return;

  const match = config.options
    .map(normalizeOption)
    .find(opt => dedupeKey(opt.label) === dedupeKey(typed));

  if (match) {
    if (config.multi) {
      addMultiValue(currentDropdownField, match.value);
      inputEl.value = '';
      renderModalOptions(config, '');
    } else {
      selectDropdownOption(match.value, match.label);
    }
    return;
  }

  if (config.allowCustom) addCustomFromSearch(currentDropdownField, config, typed);
}

/* Splits "FRCS, DMCB" into individual entries and adds each one */
function commitCustomEntries(fieldId, rawText) {
  rawText.split(',').forEach(token => {
    const text = token.trim().replace(/\s+/g, ' ');
    if (!text) return;
    addMultiValue(fieldId, canonicalize(fieldId, text));
  });
}

/* Reuse the list's own casing when the typed text matches a known option */
function canonicalize(fieldId, text) {
  const config = DROPDOWN_CONFIG[fieldId];
  const match = config.options
    .map(normalizeOption)
    .find(opt => dedupeKey(opt.label) === dedupeKey(text));
  return match ? match.label : text;
}

/* -------------------------------------------------------
   Multi-select value management
   ------------------------------------------------------- */
function addMultiValue(fieldId, value) {
  const selected = MULTI_SELECTIONS[fieldId];
  if (selected.some(v => dedupeKey(v) === dedupeKey(value))) return;
  selected.push(value);
  markFieldInteracted(fieldId);
  syncMultiField(fieldId);

  if (currentDropdownField === fieldId) {
    renderModalChips();
  }
}

function removeMultiValue(fieldId, value) {
  MULTI_SELECTIONS[fieldId] = MULTI_SELECTIONS[fieldId]
    .filter(v => dedupeKey(v) !== dedupeKey(value));
  markFieldInteracted(fieldId);
  syncMultiField(fieldId);

  if (currentDropdownField === fieldId) {
    renderModalChips();
    renderModalOptions(DROPDOWN_CONFIG[fieldId], document.getElementById('modalSearchInput').value);
  }
}

function toggleMultiValue(fieldId, value) {
  const exists = MULTI_SELECTIONS[fieldId].some(v => dedupeKey(v) === dedupeKey(value));
  if (exists) {
    removeMultiValue(fieldId, value);
  } else {
    addMultiValue(fieldId, value);
    renderModalChips();
    renderModalOptions(DROPDOWN_CONFIG[fieldId], document.getElementById('modalSearchInput').value);
  }
}

/* Push the selection into the hidden input + trigger, then revalidate */
function markFieldInteracted(id) {
  interactedFields.add(id);
}

function syncMultiField(fieldId) {
  const selected = MULTI_SELECTIONS[fieldId];
  document.getElementById(fieldId).value = selected.join(', ');
  renderTriggerChips(fieldId);
  if (!isRestoringDraft) validateField(fieldId);
  if (fieldId === 'qualifications') updateModalCloseButton();
}

function renderTriggerChips(fieldId) {
  const textEl = document.getElementById(fieldId + 'Text');
  const selected = MULTI_SELECTIONS[fieldId];

  if (selected.length === 0) {
    textEl.className = 'placeholder-text';
    textEl.textContent = DROPDOWN_CONFIG[fieldId].title.replace(/^Select /, '');
    return;
  }

  textEl.className = 'selected-text chips-inline';
  textEl.textContent = '';
  // Full list stays available on hover even when chips are collapsed
  const trigger = document.getElementById(fieldId + 'Trigger');
  if (trigger) trigger.title = selected.join(', ');

  selected.forEach(value => {
    const chip = document.createElement('span');
    chip.className = 'trigger-chip';
    chip.textContent = value;
    textEl.appendChild(chip);
  });

  fitTriggerChips(fieldId);
}

/* Keeps the trigger one row tall on any screen size: drops chips from the
   end until the row fits, then summarises the remainder as a "+N" pill. */
function fitTriggerChips(fieldId) {
  const textEl = document.getElementById(fieldId + 'Text');
  const total = MULTI_SELECTIONS[fieldId].length;
  if (!textEl || total === 0) return;

  // Can't measure a hidden element — retry once it's laid out
  if (textEl.clientWidth === 0) {
    requestAnimationFrame(() => fitTriggerChips(fieldId));
    return;
  }

  const existingCounter = textEl.querySelector('.trigger-chip-more');
  if (existingCounter) existingCounter.remove();

  if (textEl.scrollWidth <= textEl.clientWidth) return;

  const counter = document.createElement('span');
  counter.className = 'trigger-chip trigger-chip-more';
  counter.textContent = '+0';
  textEl.appendChild(counter);

  const chips = Array.from(textEl.querySelectorAll('.trigger-chip:not(.trigger-chip-more)'));
  let visible = chips.length;

  while (visible > 1 && textEl.scrollWidth > textEl.clientWidth) {
    visible--;
    chips[visible].remove();
    counter.textContent = '+' + (total - visible);
  }

  const hidden = total - visible;
  if (hidden > 0) {
    counter.textContent = '+' + hidden;
  } else {
    counter.remove();
  }
}

/* Re-fit chips when the viewport changes (orientation, resize, zoom) */
let chipFitTimer;
window.addEventListener('resize', function () {
  clearTimeout(chipFitTimer);
  chipFitTimer = setTimeout(() => {
    Object.keys(MULTI_SELECTIONS).forEach(fieldId => {
      if (MULTI_SELECTIONS[fieldId].length > 0) renderTriggerChips(fieldId);
    });
  }, 150);
});

function renderModalChips() {
  const row = document.getElementById('modalChipsRow');
  const config = DROPDOWN_CONFIG[currentDropdownField];
  row.innerHTML = '';

  if (!config || !config.multi) {
    row.classList.remove('active');
    return;
  }

  const selected = MULTI_SELECTIONS[currentDropdownField];
  row.classList.toggle('active', selected.length > 0);

  selected.forEach(value => {
    const chip = document.createElement('span');
    chip.className = 'chip';

    const label = document.createElement('span');
    label.textContent = value;
    chip.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeBtn.title = 'Remove ' + value;
    removeBtn.addEventListener('click', () => removeMultiValue(currentDropdownField, value));
    chip.appendChild(removeBtn);

    row.appendChild(chip);
  });
}

/* -------------------------------------------------------
   Add-your-own: the search box doubles as the add field.
   Typing something not in the list surfaces a clickable
   "+ Add '<text>'" row; Enter does the same thing.
   ------------------------------------------------------- */
function addCustomFromSearch(fieldId, config, rawText) {
  const typed = rawText.trim();
  if (!typed) return;

  // Single-select fields take exactly one custom value and close immediately
  if (!config.multi) {
    const value = canonicalize(fieldId, typed.replace(/\s+/g, ' '));
    applySingleCustomValue(fieldId, value);
    closeDropdownModal();
    return;
  }

  commitCustomEntries(fieldId, typed);
  const searchInput = document.getElementById('modalSearchInput');
  searchInput.value = '';
  renderModalChips();
  renderModalOptions(config, '');
  searchInput.focus();
}

/* Commits a typed-in value for a single-select field (not in the options list) */
function applySingleCustomValue(fieldId, value) {
  const hiddenInput = document.getElementById(fieldId);
  const textEl = document.getElementById(fieldId + 'Text');
  if (!hiddenInput || !textEl || !value) return;

  hiddenInput.value = value;
  textEl.textContent = value;
  textEl.classList.remove('placeholder-text');
  textEl.classList.add('selected-text');
}

function resetSearchBarMode() {
  const icon = document.getElementById('modalSearchIcon');
  if (icon) icon.className = 'fa-solid fa-magnifying-glass search-icon';
}

/* -------------------------------------------------------
   Options list rendering
   ------------------------------------------------------- */
function renderModalOptions(config, filterText) {
  const list = document.getElementById('modalOptionsList');
  const isMulti = !!config.multi;
  const selected = isMulti ? MULTI_SELECTIONS[currentDropdownField] : null;
  const currentValue = isMulti ? null : document.getElementById(currentDropdownField).value;
  const query = filterText.trim();
  const filter = query.toLowerCase();

  list.innerHTML = '';

  let optionList = config.options.map(normalizeOption);

  if (!isMulti && config.allowCustom && currentValue) {
    const isKnown = optionList.some(opt => dedupeKey(opt.value) === dedupeKey(currentValue));
    if (!isKnown) optionList = [{ value: currentValue, label: currentValue }].concat(optionList);
  }

  const filtered = optionList
    .filter(opt => {
      const label = opt.label.toLowerCase();
      if (label.includes(filter)) return true;
      const acronym = opt.label
        .split(/\s+/)
        .map(word => word[0] || '')
        .join('')
        .toLowerCase();
      return filter.length > 0 && acronym.startsWith(filter);
    });

  // Reveal the inline "+" button whenever what's typed isn't an exact known option
  const hasExactMatch = optionList.some(opt => dedupeKey(opt.label) === dedupeKey(query));
  updateInlineAddButton(!!(config.allowCustom && query && !hasExactMatch), query);

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'No matches';
    list.appendChild(li);
    return;
  }

  filtered.forEach(opt => {
    const li = document.createElement('li');
    li.textContent = opt.label;
    li.dataset.value = opt.value;

    if (isMulti) {
      if (selected.some(v => dedupeKey(v) === dedupeKey(opt.value))) li.classList.add('selected');
      li.addEventListener('click', () => toggleMultiValue(currentDropdownField, opt.value));
    } else {
      if (opt.value === currentValue) li.classList.add('selected');
      li.addEventListener('click', () => selectDropdownOption(opt.value, opt.label));
    }

    list.appendChild(li);
  });
}

/* Inline "+" button inside the search box — the mouse-driven equivalent of Enter */
function updateInlineAddButton(show, query) {
  const btn = document.getElementById('searchInlineAddBtn');
  if (!btn) return;
  btn.classList.toggle('visible', !!show);
  btn.tabIndex = show ? 0 : -1;
  btn.setAttribute('aria-hidden', show ? 'false' : 'true');
  btn.title = show ? 'Add "' + query + '"' : '';
}

function handleInlineAddClick() {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config || !config.allowCustom) return;
  const inputEl = document.getElementById('modalSearchInput');
  addCustomFromSearch(currentDropdownField, config, inputEl.value);
}

/* -------------------------------------------------------
   Single-select commit
   ------------------------------------------------------- */
function selectDropdownOption(value, label) {
  applySingleSelect(currentDropdownField, value, { focusOther: true });
  closeDropdownModal();
}

/* -------------------------------------------------------
   Field-level validation
   ------------------------------------------------------- */
const REQUIRED_FIELDS = [
  'firstName', 'email', 'phone', 'gender', 'registrationCouncil', 'mciRegdNo',
  'medicalSpecialty', 'yearsExperience', 'qualifications',
  'clinicName', 'clinicAddress', 'pincode', 'districtCity', 'state'
];


function getFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  const value = el.value.trim();

  switch (id) {
    case 'gender':
    case 'registrationCouncil':
    case 'medicalSpecialty':
    case 'yearsExperience':
    case 'state':
      if (!value) return 'This field is required.';
      break;

    case 'qualifications':
      if (MULTI_SELECTIONS.qualifications.length === 0) return 'Add at least one qualification.';
      break;

    case 'firstName':
      if (!value) return 'First name is required.';
      if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(value) || value.length < 2) return 'Name should contain letters only.';
      break;

    case 'email':
      if (!value) return 'Email address is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
      break;

    case 'phone':
      if (!phoneInput || !phoneInput.getNumber || document.getElementById('phone').value.trim() === '') {
        return 'Phone number is required.';
      }
      if (!phoneInput.isValidNumber()) return 'Enter a valid phone number.';
      break;

    case 'mciRegdNo':
      if (!value) return 'Registration number is required.';
      if (value.length < 3) return 'Enter a valid registration number.';
      break;

    case 'otherMedicalInstitute':
      if (document.getElementById('medicalInstitute').value === 'Other' && !value) {
        return 'Please specify your medical institute.';
      }
      break;


    case 'clinicName':
      if (!value) return 'Clinic / hospital name is required.';
      break;

    case 'clinicAddress':
      if (!value) return 'Clinic address is required.';
      break;

    case 'pincode':
      if (!value) return 'Pincode is required.';
      if (!/^\d{6}$/.test(value)) return 'Enter a valid 6-digit pincode.';
      break;

    case 'districtCity':
      if (!value) return 'District / City is required.';
      break;

    case 'aboutSection': {
      // The stored value is HTML, so measure the visible text only —
      // otherwise tags like <b></b> would count towards the 20 characters.
      const plain = getRtePlainText(value);
      if (plain && plain.length < 20) return 'Tell us a bit more (min. 20 characters).';
      break;
    }
  }
  return '';
}

function validateField(id, forceShow) {
  const el = document.getElementById(id);
  if (!el) return true;
  const group = el.closest('.form-group');
  const error = getFieldError(id);

  // Dropdown-modal fields are backed by a hidden input; the visible
  // custom-select-trigger is what should carry the error styling.
  const trigger = document.getElementById(id + 'Trigger');
  const errorTarget = trigger || el;

  const showError = !!error && (forceShow || interactedFields.has(id)) && !isRestoringDraft;

  if (group) {
    const msgEl = group.querySelector('.field-error-msg');
    if (showError) {
      group.classList.add('invalid');
      errorTarget.classList.add('error');
      if (msgEl) msgEl.textContent = error;
    } else {
      group.classList.remove('invalid');
      errorTarget.classList.remove('error');
    }
  }

  validateForm();
  return !error;
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const group = el.closest('.form-group');
  if (group) {
    group.classList.remove('invalid');
    el.classList.remove('error');
  }
}

/* -------------------------------------------------------
   Whole-form validation (toggles submit button)
   ------------------------------------------------------- */
function validateForm() {
  let isValid = true;

  REQUIRED_FIELDS.forEach(id => {
    if (getFieldError(id)) isValid = false;
  });

  const instituteSelect = document.getElementById('medicalInstitute');
  if (instituteSelect.value === 'Other' && getFieldError('otherMedicalInstitute')) isValid = false;

  if (getFieldError('aboutSection')) isValid = false;

  const agreeTerms = document.getElementById('agreeTerms');
  if (!agreeTerms.checked) isValid = false;

  document.getElementById('submitBtn').disabled = !isValid;
  persistDraft();
  return isValid;
}

/* -------------------------------------------------------
   Form Submission
   ------------------------------------------------------- */
function handleOnboardingSubmit(event) {
  event.preventDefault();

  // Force-validate every field to surface any hidden errors
  const idsToCheck = REQUIRED_FIELDS.concat(['otherMedicalInstitute', 'aboutSection']);
  let firstInvalid = null;
  idsToCheck.forEach(id => {
    markFieldInteracted(id);
    const ok = validateField(id, true);
    if (!ok && !firstInvalid) {
      // The About field's real input is the rich text editor, not the
      // hidden textarea — focus the visible box so the doctor can see it.
      firstInvalid = id === 'aboutSection'
        ? document.getElementById('aboutEditor')
        : document.getElementById(id);
    }
  });

  if (!validateForm()) {
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  // Stop here if the About Section is still open for editing, so the
  // doctor's unsaved text can't be silently left out of the submission.
  if (aboutEditMode) {
    alert('Please save or cancel the About Section before submitting.');
    document.getElementById('aboutEditor').focus();
    return;
  }

  const formData = {
    salutation: 'Doctor',
    firstName: document.getElementById('firstName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: phoneInput.getNumber(),
    gender: document.getElementById('gender').value,
    registrationCouncil: document.getElementById('registrationCouncil').value,
    mciRegdNo: document.getElementById('mciRegdNo').value.trim(),
    medicalSpecialty: document.getElementById('medicalSpecialty').value,
    medicalSubSpecialty: document.getElementById('medicalSubSpecialty').value,
    yearsExperience: document.getElementById('yearsExperience').value,
    qualifications: MULTI_SELECTIONS.qualifications.slice(),
    medicalInstitute: document.getElementById('medicalInstitute').value === 'Other'
      ? document.getElementById('otherMedicalInstitute').value.trim()
      : document.getElementById('medicalInstitute').value,
    clinicName: document.getElementById('clinicName').value.trim(),
    clinicAddress: document.getElementById('clinicAddress').value.trim(),
    pincode: document.getElementById('pincode').value.trim(),
    districtCity: document.getElementById('districtCity').value.trim(),
    state: document.getElementById('state').value,
    // About Section is rich text. It is sent twice:
    //   aboutSection     - safe HTML (bold / italic / bullets kept)
    //   aboutSectionText - the same words with no formatting, for
    //                      anywhere that cannot display HTML.
    // Sanitized once more here so nothing unsafe can ever leave the form.
    aboutSection: sanitizeRteHtml(document.getElementById('aboutSection').value.trim()),
    aboutSectionText: getRtePlainText(document.getElementById('aboutSection').value),
    profilePhoto: localStorage.getItem(PHOTO_STORAGE_KEY) || ''
  };

  console.log('Onboarding Form Submitted:', formData);

  formSubmitted = true;
  clearPersistedDraft();

  document.getElementById('onboardingFormContent').style.display = 'none';
  document.getElementById('onboardingSuccessContent').style.display = 'block';
}

/* =========================================================
   RICH TEXT EDITOR (About Section)

   How it works, in one paragraph:
   The doctor types into #aboutEditor, which is a normal <div>
   with contenteditable="true" (that is what makes a div
   typeable). Every time the content changes we clean it and
   copy it into the hidden <textarea id="aboutSection">. All
   the existing form code (validation, draft saving, submit)
   keeps reading that textarea, so nothing else had to change.

   Only three formats are allowed: bold, italic, bullet list.
   ========================================================= */

/* The only HTML tags we allow to be saved. Anything else the
   browser or a paste might produce gets stripped out.
   This is what stops unsafe HTML (e.g. <script>) being saved. */
const RTE_ALLOWED_TAGS = ['B', 'STRONG', 'I', 'EM', 'UL', 'LI', 'BR', 'DIV', 'P'];

/* Removes everything we don't allow from a chunk of HTML.
   Returns clean HTML text that is safe to store and re-display.

   Two rules:
   1. A tag that is not in the allow-list is unwrapped - the tag
      itself disappears but the words inside it are kept.
   2. Every attribute is removed (style, class, onclick, href...),
      so no script or styling can sneak in via a paste. */
function sanitizeRteHtml(dirtyHtml) {
  // Parse the HTML inside a separate, inactive document. Nothing in it
  // can run or load - an <img onerror="..."> here never fires, because
  // the document it lives in is not the page the doctor is looking at.
  const holder = document.implementation
    .createHTMLDocument('rte-sanitizer')
    .createElement('div');
  holder.innerHTML = dirtyHtml;

  // Walk every element. We copy the list first because we are
  // modifying the tree while looping over it.
  const elements = Array.prototype.slice.call(holder.querySelectorAll('*'));

  elements.forEach(el => {
    // Rule 1: not an allowed tag -> replace the tag with its own contents
    if (RTE_ALLOWED_TAGS.indexOf(el.tagName) === -1) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
      return;
    }
    // Rule 2: strip every attribute from the tags we do keep
    while (el.attributes.length > 0) {
      el.removeAttribute(el.attributes[0].name);
    }
  });

  return holder.innerHTML;
}

/* Returns just the words the doctor typed, with all tags removed.
   Used for the "minimum 20 characters" check, so that markup
   like <b></b> is never counted as if it were real text. */
function getRtePlainText(html) {
  // Same inactive-document trick as above, so reading the text of
  // untrusted HTML can never trigger anything.
  const holder = document.implementation
    .createHTMLDocument('rte-text')
    .createElement('div');
  holder.innerHTML = html || '';
  // \u00A0 is a non-breaking space (&nbsp;) - treat it as a normal space
  return (holder.textContent || '').replace(/\u00A0/g, ' ').trim();
}

/* True when the editor has no real content. An "empty" editor can
   still contain leftover markup like <br> or <div><br></div>,
   which is why we check the text and not the HTML. */
function isRteEmpty(editor) {
  if (getRtePlainText(editor.innerHTML) !== '') return false;
  // A list the doctor just started counts as content, not empty
  return !editor.querySelector('ul, li');
}

/* Copies the editor content into the hidden textarea and
   re-runs the normal form validation. Called on every change. */
function syncRteToTextarea() {
  const editor = document.getElementById('aboutEditor');
  const textarea = document.getElementById('aboutSection');
  if (!editor || !textarea) return;

  // Show or hide the grey placeholder text
  editor.classList.toggle('is-empty', isRteEmpty(editor));

  // Store empty string (not stray markup) when there is no real text
  textarea.value = isRteEmpty(editor) ? '' : sanitizeRteHtml(editor.innerHTML);

  markFieldInteracted('aboutSection');
  validateField('aboutSection');
}

/* Runs when a toolbar button is pressed.

   We use onmousedown + preventDefault instead of onclick so the
   editor never loses focus - if it did, the browser would forget
   which text was selected and the formatting would apply to
   nothing. */
function handleRteButton(event, command) {
  event.preventDefault();

  const editor = document.getElementById('aboutEditor');
  if (!editor || editor.getAttribute('contenteditable') !== 'true') return;

  editor.focus();

  // execCommand is the long-standing browser API for contenteditable
  // formatting. It is marked deprecated but is still supported in every
  // current browser and has no standard replacement.
  try {
    document.execCommand(command, false, null);
  } catch (err) {
    console.warn('Formatting command failed:', command, err);
  }

  syncRteToTextarea();
  updateRteToolbarState();
}

/* Highlights the toolbar buttons that are active where the
   cursor currently is (e.g. B lights up inside bold text). */
function updateRteToolbarState() {
  const editor = document.getElementById('aboutEditor');
  const toolbar = document.getElementById('aboutRteToolbar');
  if (!editor || !toolbar) return;

  toolbar.querySelectorAll('.rte-btn').forEach(btn => {
    const command = btn.dataset.rteCommand;
    let isOn = false;
    try {
      isOn = document.queryCommandState(command);
    } catch (err) {
      isOn = false;
    }
    btn.classList.toggle('active', !!isOn);
  });
}

/* Puts saved content back into the editor. Used when a draft is
   restored from localStorage and when an edit is cancelled.
   The value is sanitized on the way in as well as on the way out,
   so even a tampered draft in localStorage cannot inject HTML. */
function setRteContent(html) {
  const editor = document.getElementById('aboutEditor');
  const textarea = document.getElementById('aboutSection');
  if (!editor || !textarea) return;

  const clean = sanitizeRteHtml(html || '');
  editor.innerHTML = clean;
  textarea.value = isRteEmpty(editor) ? '' : clean;
  editor.classList.toggle('is-empty', isRteEmpty(editor));
}

/* Wires up the editor once, when the page loads. */
function initRichTextEditor() {
  const editor = document.getElementById('aboutEditor');
  if (!editor) return;

  // Any typing, deleting or formatting change
  editor.addEventListener('input', syncRteToTextarea);

  // Keep the toolbar highlights in step with the cursor
  editor.addEventListener('keyup', updateRteToolbarState);
  editor.addEventListener('mouseup', updateRteToolbarState);

  // Paste: always insert plain text. This is the single most common
  // way unwanted markup (fonts, colours, Word styling) gets in, so we
  // take the text only and drop everything else.
  editor.addEventListener('paste', function (e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // Drag-and-dropped content can carry markup too - block it.
  editor.addEventListener('drop', e => e.preventDefault());

  // Ctrl/Cmd + B and Ctrl/Cmd + I keyboard shortcuts
  editor.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      handleRteButton(e, key === 'b' ? 'bold' : 'italic');
    }
  });

  // Start in the locked state showing the placeholder
  editor.classList.toggle('is-empty', isRteEmpty(editor));
}

/* -------------------------------------------------------
   About Section Edit Mode (locked <-> editing)
   ------------------------------------------------------- */
function enterAboutEditMode() {
  aboutEditMode = true;
  const editor = document.getElementById('aboutEditor');
  const wrapper = document.getElementById('aboutRteWrapper');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  // Remember the current content so "Cancel" can put it back
  aboutOriginalValue = document.getElementById('aboutSection').value;

  wrapper.classList.add('is-editing');       // shows toolbar + blue border
  editor.setAttribute('contenteditable', 'true');
  editor.focus();

  editBtn.style.display = 'none';
  actionBtns.style.display = 'flex';
  updateRteToolbarState();
}

function cancelAboutEdit() {
  aboutEditMode = false;
  const editor = document.getElementById('aboutEditor');
  const wrapper = document.getElementById('aboutRteWrapper');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  setRteContent(aboutOriginalValue);          // discard the changes
  wrapper.classList.remove('is-editing');
  editor.setAttribute('contenteditable', 'false');

  editBtn.style.display = 'inline-flex';
  actionBtns.style.display = 'none';
  validateField('aboutSection');
  persistDraft();
}

function saveAboutEdit() {
  aboutEditMode = false;
  const editor = document.getElementById('aboutEditor');
  const wrapper = document.getElementById('aboutRteWrapper');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  syncRteToTextarea();                        // keep the latest content
  wrapper.classList.remove('is-editing');
  editor.setAttribute('contenteditable', 'false');

  editBtn.style.display = 'inline-flex';
  actionBtns.style.display = 'none';
  validateField('aboutSection');
  persistDraft();
}

/* =========================================================
   Legal Content Modal (Terms of Service / Privacy Policy)
   ========================================================= */
const LEGAL_CONTENT = {
  terms: {
    icon: 'fa-file-shield',
    title: 'Terms of Service',
    updated: 'Last updated on 20th May 2026',
    html: `
      <p>Welcome to DigiDr, a subscription-based platform enabling doctors and small healthcare providers to build and manage their digital presence. By using DigiDr, you agree to these Terms of Service.</p>

      <h4>1. Eligibility</h4>
      <p>DigiDr is available only to licensed medical professionals, healthcare practitioners, and registered healthcare organisations.</p>
      <p>You are responsible for providing accurate, complete, and current registration information.</p>

      <h4>2. Services Provided</h4>
      <p>DigiDr offers tools for creating digital microsites, publishing content, managing appointments, collecting reviews, and accessing analytics.</p>
      <p>DigiDr may update or improve services periodically.</p>

      <h4>3. Account &amp; Responsibilities</h4>
      <p>You are responsible for all activity under your account and for maintaining the confidentiality of your login credentials.</p>
      <p>All content (text, photos, credentials) uploaded to DigiDr must be accurate, lawful, and owned or licensed by you.</p>

      <h4>4. Payments &amp; Subscriptions</h4>
      <p>Use of DigiDr is based on a subscription model with a one-time setup fee and recurring monthly/annual charges.</p>
      <p>Fees are non-refundable except as outlined in the Cancellation Policy.</p>
      <p>DigiDr reserves the right to change pricing with prior notice.</p>

      <h4>5. Content Ownership &amp; Use</h4>
      <p>All doctor data, content, and patient information remain your property.</p>
      <p>By using DigiDr, you grant DigiDr a limited license to display and distribute your content only for operating the platform.</p>
      <p>DigiDr will not sell or share your data with third parties without your consent.</p>

      <h4>6. Patient Data Privacy</h4>
      <p>Any patient-related information collected through DigiDr will be handled securely and only for the intended healthcare purpose.</p>
      <p>You are responsible for complying with applicable healthcare privacy laws in your jurisdiction.</p>

      <h4>7. Termination</h4>
      <p>You may cancel your subscription at any time.</p>
      <p>DigiDr may suspend or terminate accounts violating these terms, engaging in illegal activity, or misusing the platform.</p>

      <h4>8. Liability &amp; Disclaimers</h4>
      <p>DigiDr provides services as is, without warranties of any kind.</p>
      <p>DigiDr is not liable for indirect, incidental, or consequential damages arising from platform use.</p>
      <p>You remain solely responsible for all medical advice and services you provide to patients.</p>

      <h4>9. Governing Law</h4>
      <p>These Terms are governed by the laws of India, and any disputes shall be subject to the exclusive jurisdiction of courts in Mumbai, Maharashtra.</p>

      <h4>10. Contact</h4>
      <p>For questions about these Terms, please contact: <a href="mailto:support@digidr.in">support@digidr.in</a></p>
      <p>By signing up, you agree to abide by these Terms of Service and all applicable laws.</p>
    `
  },
  privacy: {
    icon: 'fa-user-shield',
    title: 'Privacy Policy',
    updated: 'Last updated on 20th May 2026',
    html: `
      <p>At DigiDr, we prioritise the privacy and security of all doctors, clinics, and their patients.</p>

      <h4>Data Ownership</h4>
      <p>All data (doctor profiles, clinic details, patient information) belongs solely to the respective doctors/clinics. DigiDr commits to never selling or sharing this information.</p>

      <h4>Data Usage</h4>
      <p>Information serves only to deliver DigiDr services &mdash; including microsites and content publishing &mdash; and requires explicit user consent from account holders.</p>

      <h4>Patient Data Privacy</h4>
      <p>Patient-related information (appointments, feedback, contact details) is stored securely and is accessible only to the respective doctor/clinic.</p>

      <h4>Security Measures</h4>
      <p>All data is encrypted, stored on secure servers, and protected using industry-standard security protocols.</p>

      <h4>Third-Party Sharing</h4>
      <p>DigiDr refrains from sharing personal or clinic data with external parties without consent, except when legally mandated.</p>

      <h4>Compliance</h4>
      <p>The platform adheres to applicable data protection regulations, including India's DPDP Act and GDPR principles.</p>

      <h4>Closing Statement</h4>
      <p>Your data stays yours. DigiDr only powers your presence &mdash; never compromises your privacy.</p>
    `
  }
};

function openLegalModal(type) {
  const content = LEGAL_CONTENT[type];
  if (!content) return;

  const backdrop = document.getElementById('legalModalBackdrop');
  const icon = document.getElementById('legalModalIcon');
  const titleText = document.getElementById('legalModalTitleText');
  const body = document.getElementById('legalModalBody');

  icon.className = 'fa-solid ' + content.icon;
  titleText.textContent = content.title;
  body.innerHTML = `<p class="legal-updated">${content.updated}</p>${content.html}`;

  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLegalModal() {
  const backdrop = document.getElementById('legalModalBackdrop');
  if (!backdrop.classList.contains('active')) return;
  backdrop.classList.remove('active');
  document.body.style.overflow = '';
}

function handleLegalModalBackdropClick(e) {
  if (e.target.id === 'legalModalBackdrop') closeLegalModal();
}
