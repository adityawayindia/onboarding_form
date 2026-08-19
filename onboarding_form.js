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
  ['otherMedicalSpecialty', 'otherMedicalInstitute'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      markFieldInteracted(id);
      validateField(id);
    });
  });

  /* -------------------------------------------------------
     Escape key closes the dropdown modal
     ------------------------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDropdownModal();
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
  const allFieldIds = [
    'firstName', 'email', 'gender', 'mciRegdNo',
    'medicalSpecialty', 'otherMedicalSpecialty', 'yearsExperience',
    'qualifications',
    'medicalInstitute', 'otherMedicalInstitute',
    'clinicName', 'clinicAddress', 'pincode', 'districtCity', 'state',
    'aboutSection'
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
  medicalSpecialty: {
    title: 'Select Medical Specialty',
    icon: 'fa-stethoscope',
    options: [
      'Cardiology', 'Dermatology', 'Endocrinology', 'Gastroenterology', 'General Surgery',
      'Internal Medicine', 'Intensivist / Critical Care', 'Neurology', 'Obstetrics & Gynecology',
      'Oncology', 'Ophthalmology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
      'Radiology', 'Urology', 'Other'
    ],
    otherGroupId: 'otherMedicalSpecialtyGroup',
    otherInputId: 'otherMedicalSpecialty'
  },
  medicalSubSpecialty: {
    title: 'Select Medical Sub-specialty',
    icon: 'fa-bookmark',
    options: [
      'Interventional Cardiology', 'Pediatric Surgery', 'Neuro-Oncology', 'Joint Replacement',
      'Maternal-Fetal Medicine', 'Retina & Vitreous', 'Other'
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
let customAddRowOpen = false;
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
    mciRegdNo: document.getElementById('mciRegdNo').value,
    medicalSpecialty: document.getElementById('medicalSpecialty').value,
    otherMedicalSpecialty: document.getElementById('otherMedicalSpecialty').value,
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
        'clinicName', 'clinicAddress', 'pincode', 'districtCity', 'aboutSection'
      ];
      textIds.forEach(id => {
        if (typeof draft[id] === 'string') document.getElementById(id).value = draft[id];
      });

      ['gender', 'medicalSpecialty', 'medicalSubSpecialty', 'yearsExperience', 'medicalInstitute', 'state']
        .forEach(id => applySingleSelect(id, draft[id] || ''));

      if (draft.medicalSpecialty === 'Other' && typeof draft.otherMedicalSpecialty === 'string') {
        document.getElementById('otherMedicalSpecialty').value = draft.otherMedicalSpecialty;
      }
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
  customAddRowOpen = false;

  const backdrop = document.getElementById('selectModalBackdrop');
  const searchInput = document.getElementById('modalSearchInput');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitleText = document.getElementById('modalTitleText');

  modalIcon.className = 'fa-solid ' + config.icon;
  modalTitleText.textContent = config.title;
  searchInput.value = '';
  searchInput.placeholder = config.placeholder || 'Search...';

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
  customAddRowOpen = false;
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
  if (!config || config.allowCustom) return;

  const inputEl = document.getElementById('modalSearchInput');
  const typed = inputEl.value.trim();
  if (!typed) return;

  const match = config.options
    .map(normalizeOption)
    .find(opt => dedupeKey(opt.label) === dedupeKey(typed));
  if (match) selectDropdownOption(match.value, match.label);
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
   "Add other ..." row — opens inline input + Save in place
   ------------------------------------------------------- */
function renderStaticAddRow(list, config) {
  const li = document.createElement('li');
  li.className = 'static-other-row';

  const label = document.createElement('span');
  label.className = 'static-other-label';
  label.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Add other '
    + config.title.replace(/^Select /i, '').toLowerCase()
    + ' (if not present in the list)';
  li.appendChild(label);

  li.addEventListener('click', () => {
    customAddRowOpen = true;
    const searchVal = document.getElementById('modalSearchInput').value;
    renderModalOptions(config, searchVal);
  });
  list.appendChild(li);
}

function renderCustomAddForm(list, config) {
  const li = document.createElement('li');
  li.className = 'static-other-row custom-add-form-row';

  const form = document.createElement('div');
  form.className = 'custom-add-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'custom-add-input';
  input.placeholder = 'Type qualification...';
  input.autocomplete = 'off';
  input.addEventListener('input', function () {
    this.value = this.value.replace(/[0-9]/g, '');
    updateCustomAddSaveButton(input, saveBtn);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!saveBtn.disabled) saveCustomQualification(this);
    } else if (e.key === 'Escape') {
      customAddRowOpen = false;
      renderModalOptions(config, document.getElementById('modalSearchInput').value);
    }
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'custom-add-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', () => {
    if (!saveBtn.disabled) saveCustomQualification(input);
  });

  form.appendChild(input);
  form.appendChild(saveBtn);
  li.appendChild(form);
  list.appendChild(li);

  setTimeout(() => input.focus(), 0);
}

function updateCustomAddSaveButton(inputEl, saveBtn) {
  if (!inputEl || !saveBtn) return;
  saveBtn.disabled = inputEl.value.trim().length === 0;
}

function saveCustomQualification(inputEl) {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config || !config.allowCustom) return;

  const typed = inputEl.value.trim();
  if (!typed) return;

  commitCustomEntries(currentDropdownField, typed);
  customAddRowOpen = false;
  renderModalChips();
  renderModalOptions(config, document.getElementById('modalSearchInput').value);
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

  if (config.allowCustom && !query) {
    if (customAddRowOpen) {
      renderCustomAddForm(list, config);
    } else {
      renderStaticAddRow(list, config);
    }
  }

  const filtered = config.options
    .map(normalizeOption)
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

  const extraRows = list.querySelectorAll('.static-other-row').length;
  if (filtered.length === 0 && extraRows === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = config.allowCustom && query
      ? 'Not in the list'
      : 'No matches found';
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
  'firstName', 'email', 'phone', 'gender', 'mciRegdNo',
  'medicalSpecialty', 'yearsExperience', 'qualifications',
  'clinicName', 'clinicAddress', 'pincode', 'districtCity', 'state'
];


function getFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  const value = el.value.trim();

  switch (id) {
    case 'gender':
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

    case 'otherMedicalSpecialty':
      if (document.getElementById('medicalSpecialty').value === 'Other' && !value) {
        return 'Please specify your speciality.';
      }
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

    case 'aboutSection':
      if (value && value.length < 20) return 'Tell us a bit more (min. 20 characters).';
      break;
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

  const specialtySelect = document.getElementById('medicalSpecialty');
  if (specialtySelect.value === 'Other' && getFieldError('otherMedicalSpecialty')) isValid = false;

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
  const idsToCheck = REQUIRED_FIELDS.concat(['otherMedicalSpecialty', 'otherMedicalInstitute', 'aboutSection']);
  let firstInvalid = null;
  idsToCheck.forEach(id => {
    markFieldInteracted(id);
    const ok = validateField(id, true);
    if (!ok && !firstInvalid) firstInvalid = document.getElementById(id);
  });

  if (!validateForm()) {
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  const formData = {
    salutation: 'Doctor',
    firstName: document.getElementById('firstName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: phoneInput.getNumber(),
    gender: document.getElementById('gender').value,
    mciRegdNo: document.getElementById('mciRegdNo').value.trim(),
    medicalSpecialty: document.getElementById('medicalSpecialty').value === 'Other'
      ? document.getElementById('otherMedicalSpecialty').value.trim()
      : document.getElementById('medicalSpecialty').value,
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
    aboutSection: document.getElementById('aboutSection').value.trim(),
    profilePhoto: localStorage.getItem(PHOTO_STORAGE_KEY) || ''
  };

  if (aboutEditMode) {
    alert('Please save or cancel the About Section before submitting.');
    return;
  }

  console.log('Onboarding Form Submitted:', formData);

  formSubmitted = true;
  clearPersistedDraft();

  document.getElementById('onboardingFormContent').style.display = 'none';
  document.getElementById('onboardingSuccessContent').style.display = 'block';
}

/* -------------------------------------------------------
   About Section Edit Mode
   ------------------------------------------------------- */
function enterAboutEditMode() {
  aboutEditMode = true;
  const textarea = document.getElementById('aboutSection');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  aboutOriginalValue = textarea.value;
  textarea.removeAttribute('readonly');
  textarea.focus();
  editBtn.style.display = 'none';
  actionBtns.style.display = 'flex';
}

function cancelAboutEdit() {
  aboutEditMode = false;
  const textarea = document.getElementById('aboutSection');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  textarea.value = aboutOriginalValue;
  textarea.setAttribute('readonly', '');
  editBtn.style.display = 'inline-flex';
  actionBtns.style.display = 'none';
  persistDraft();
}

function saveAboutEdit() {
  aboutEditMode = false;
  const textarea = document.getElementById('aboutSection');
  const editBtn = document.getElementById('aboutEditBtn');
  const actionBtns = document.getElementById('aboutActionBtns');

  textarea.setAttribute('readonly', '');
  editBtn.style.display = 'inline-flex';
  actionBtns.style.display = 'none';
  validateField('aboutSection');
  persistDraft();
}
