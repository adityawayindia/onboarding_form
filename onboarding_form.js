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

  /* If a photo already exists, clicking the avatar opens a preview popup
     (with a re-upload option) instead of the file picker. */
  const photoModal = document.getElementById('photoModal');
  const closePhotoModal = () => {
    photoModal.classList.remove('open');
    photoModal.setAttribute('aria-hidden', 'true');
  };

  document.querySelector('.avatar-upload').addEventListener('click', function (e) {
    // Programmatic photoInput.click() bubbles up to this label; let it through
    if (e.target === photoInput) return;
    const img = document.querySelector('#avatarPreview img');
    if (!img) return;
    e.preventDefault();
    document.getElementById('photoModalImg').src = img.src;
    photoModal.classList.add('open');
    photoModal.setAttribute('aria-hidden', 'false');
  });
  document.getElementById('photoModalClose').addEventListener('click', closePhotoModal);
  photoModal.addEventListener('click', function (e) {
    if (e.target === photoModal) closePhotoModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && photoModal.classList.contains('open')) closePhotoModal();
  });
  document.getElementById('photoModalReupload').addEventListener('click', function () {
    closePhotoModal();
    photoInput.click();
  });

  document.getElementById('photoModalRemove').addEventListener('click', function () {
    closePhotoModal();
    document.getElementById('avatarPreview').innerHTML = '<i class="fa-solid fa-user"></i>';
    photoInput.value = '';
    try {
      localStorage.removeItem(PHOTO_STORAGE_KEY);
    } catch (err) {
      console.warn('Could not remove saved profile photo:', err);
    }
    persistDraft();
  });

  photoInput.addEventListener('change', function () {
    const file = this.files[0];
    photoError.style.display = 'none';
    photoError.textContent = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      photoError.textContent = 'Please upload an image file.';
      photoError.style.display = 'block';
      this.value = '';
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = function () {
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
    'firstName', 'email', 'gender', 'registrationCouncil', 'stateCouncil', 'mciRegdNo',
    'medicalSpecialty', 'medicalSubSpecialty',
    'qualifications', 'registrationYear',
    'medicalInstitute', 'otherMedicalInstitute'
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

  /* -------------------------------------------------------
     Hospital/Clinic Location(s) — starts with one location
     ------------------------------------------------------- */
  addClinicLocation();
  addFellowship();

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
/* ---------------------------------------------------------
   Fellowship data, from Fellowship.pdf.
   Each entry is [abbreviation, full form, specialties]. Specialties are
   space-separated codes: 'all' (any specialty), 'med' / 'surg' (groups),
   or the individual codes below, mapped to the Medical Specialty list.
   --------------------------------------------------------- */
const FELLOWSHIP_SPECIALTY_CODES = {
  card: 'Cardiology', derm: 'Dermatology', endo: 'Endocrinology', gi: 'Gastroenterology',
  gs: 'General Surgery', im: 'Internal Medicine', icu: 'Intensivist / Critical Care',
  neuro: 'Neurology', obg: 'Obstetrics & Gynecology', onc: 'Oncology', ophth: 'Ophthalmology',
  ortho: 'Orthopedics', peds: 'Pediatrics', psy: 'Psychiatry', pulm: 'Pulmonology',
  rad: 'Radiology', uro: 'Urology'
};
const FELLOWSHIP_SPECIALTY_GROUPS = {
  med: 'im card endo gi neuro onc pulm icu derm',
  surg: 'gs ortho uro ophth'
};

// `flags` are ISO country codes drawn by the flag-icons library; options with
// no single flag (international / other) use a Font Awesome globe instead.
const FELLOWSHIP_COUNTRIES = [
  { value: 'india', label: 'India', flags: ['in'] },
  { value: 'australia', label: 'Australia', flags: ['au'] },
  { value: 'austria', label: 'Austria', flags: ['at'] },
  { value: 'bangladesh', label: 'Bangladesh', flags: ['bd'] },
  { value: 'canada', label: 'Canada', flags: ['ca'] },
  { value: 'france', label: 'France', flags: ['fr'] },
  { value: 'germany', label: 'Germany', flags: ['de'] },
  { value: 'hongkong', label: 'Hong Kong', flags: ['hk'] },
  { value: 'indonesia', label: 'Indonesia', flags: ['id'] },
  { value: 'ireland', label: 'Ireland', flags: ['ie'] },
  { value: 'malaysia', label: 'Malaysia', flags: ['my'] },
  { value: 'nepal', label: 'Nepal', flags: ['np'] },
  { value: 'nz', label: 'New Zealand', flags: ['nz'] },
  { value: 'pakistan', label: 'Pakistan', flags: ['pk'] },
  { value: 'philippines', label: 'Philippines', flags: ['ph'] },
  { value: 'singapore', label: 'Singapore', flags: ['sg'] },
  { value: 'za', label: 'South Africa', flags: ['za'] },
  { value: 'srilanka', label: 'Sri Lanka', flags: ['lk'] },
  { value: 'switzerland', label: 'Switzerland', flags: ['ch'] },
  { value: 'uk', label: 'United Kingdom', flags: ['gb'] },
  { value: 'usa', label: 'United States of America', flags: ['us'] },
  { value: 'intl', label: 'International Societies & European Boards', faIcon: 'fa-globe' },
  { value: 'other', label: 'Other Country', faIcon: 'fa-earth-asia' }
];

/* Small flag(s) or icon for an option that has `flags` / `faIcon`; null otherwise */
function buildOptionFlags(opt) {
  if (!opt.flags && !opt.faIcon) return null;
  const wrap = document.createElement('span');
  wrap.className = 'opt-flags';
  if (opt.flags) {
    opt.flags.forEach(code => {
      const flag = document.createElement('span');
      flag.className = 'fi fi-' + code;
      wrap.appendChild(flag);
    });
  } else {
    wrap.innerHTML = '<i class="fa-solid ' + opt.faIcon + '"></i>';
  }
  return wrap;
}

const FELLOWSHIPS = {
  india: [
    ['FNB', 'Fellow of National Board', 'all'],
    ['FNB-PD', 'Fellow of National Board - Post Doctoral', 'all'],
    ['DNB', 'Diplomate of National Board', 'all'],
    ['DrNB', 'Doctorate of National Board', 'all'],
    ['DM', 'Doctor of Medicine (super-specialty degree)', 'med'],
    ['MCh', 'Master of Chirurgiae (super-specialty surgical degree)', 'surg'],
    ['FAMS', 'Fellow of the National Academy of Medical Sciences', 'all'],
    ['FIAGES', 'Fellow of the Indian Association of Gastrointestinal Endosurgeons', 'gs gi'],
    ['FALS', 'Fellowship of the Association of Surgeons of India in Laparoscopic Surgery', 'gs'],
    ['FICOG', 'Fellow of the Indian College of Obstetricians and Gynaecologists', 'obg'],
    ['FICC', 'Fellow of the Indian College of Cardiology', 'card'],
    ['FCSI', 'Fellow of the Cardiological Society of India', 'card'],
    ['FIMSA', 'Fellow of the International Medical Sciences Academy', 'all'],
    ['FISN', 'Fellowship of the Indian Society of Nephrology', 'im'],
    ['FICP', 'Fellow of the Indian College of Physicians', 'im'],
    ['FICM', 'Fellowship of the Indian College of Critical Care Medicine', 'icu'],
    ['FNB Arthroplasty', 'Fellowship of National Board in Arthroplasty', 'ortho'],
    ['FNB Breast Imaging', 'Fellowship of National Board in Breast Imaging', 'rad'],
    ['FNB Hand & Micro Surgery', 'Fellowship of National Board in Hand and Microsurgery', 'ortho gs'],
    ['FNB Infectious Diseases', 'Fellowship of National Board in Infectious Diseases', 'im'],
    ['FNB Maternal & Foetal Medicine', 'Fellowship of National Board in Maternal and Foetal Medicine', 'obg'],
    ['FNB Minimal Access Surgery', 'Fellowship of National Board in Minimal Access Surgery', 'gs obg uro'],
    ['FNB Paediatric Gastroenterology', 'Fellowship of National Board in Paediatric Gastroenterology', 'peds gi'],
    ['FNB Paediatric Haemato-Oncology', 'Fellowship of National Board in Paediatric Haemato-Oncology', 'peds onc'],
    ['FNB Paediatric Nephrology', 'Fellowship of National Board in Paediatric Nephrology', 'peds'],
    ['FNB Pain Medicine', 'Fellowship of National Board in Pain Medicine', 'icu'],
    ['FNB Reproductive Medicine', 'Fellowship of National Board in Reproductive Medicine', 'obg'],
    ['FNB Spine Surgery', 'Fellowship of National Board in Spine Surgery', 'ortho'],
    ['FNB Sports Medicine', 'Fellowship of National Board in Sports Medicine', 'ortho'],
    ['FNB Vitreo-Retinal Surgery', 'Fellowship of National Board in Vitreo-Retinal Surgery', 'ophth'],
    ['FNB Interventional Cardiology (PD)', 'Postdoctoral Fellowship of National Board in Interventional Cardiology', 'card'],
    ['FNB Liver Transplantation (PD)', 'Postdoctoral Fellowship of National Board in Liver Transplantation', 'gi gs'],
    ['FNB Neurovascular Intervention (PD)', 'Postdoctoral Fellowship of National Board in Neurovascular Intervention', 'neuro rad']
  ],
  uk: [
    ['FRCS', 'Fellow of the Royal College of Surgeons', 'surg'],
    ['FRCP', 'Fellow of the Royal College of Physicians', 'med'],
    ['MRCP (UK)', 'Membership of the Royal Colleges of Physicians', 'med'],
    ['MRCS', 'Membership of the Royal Colleges of Surgeons', 'surg'],
    ['FRCR', 'Fellow of the Royal College of Radiologists', 'rad onc'],
    ['MRCPsych', 'Membership of the Royal College of Psychiatrists', 'psy'],
    ['MRCPCH', 'Membership of the Royal College of Paediatrics and Child Health', 'peds'],
    ['FRCEM', 'Fellow of the Royal College of Emergency Medicine', 'icu'],
    ['FRCGP', 'Fellow of the Royal College of General Practitioners', 'im'],
    ['FRCOG', 'Fellow of the Royal College of Obstetricians and Gynaecologists', 'obg'],
    ['FRCA', 'Fellow of the Royal College of Anaesthetists', 'icu'],
    ['FRCS (Orth)', 'Fellowship in Trauma and Orthopaedic Surgery', 'ortho'],
    ['FRCS (Neuro.Surg.)', 'Fellowship in Neurosurgery', 'neuro'],
    ['FRCS (Plast)', 'Fellowship in Plastic Surgery', 'gs'],
    ['FRCS (Urol)', 'Fellowship in Urology', 'uro'],
    ['FRCS (ORL-HNS)', 'Fellowship in Otolaryngology-Head and Neck Surgery', 'gs'],
    ['FRCSI', 'Fellow of the Royal College of Surgeons in Ireland', 'surg'],
    ['FRCPI', 'Fellow of the Royal College of Physicians of Ireland', 'med'],
    ['MRCPI', 'Member of the Royal College of Physicians of Ireland', 'med'],
    ['FRCPI (Paeds)', 'Fellowship of the Royal College of Physicians of Ireland in Paediatrics', 'peds'],
    ['FCAI', 'Fellow of the College of Anaesthesiologists of Ireland', 'icu'],
    ['FFR RCSI', 'Fellow of the Faculty of Radiologists, Royal College of Surgeons in Ireland', 'rad']
  ],
  usa: [
    ['FACP', 'Fellow of the American College of Physicians', 'med'],
    ['FACS', 'Fellow of the American College of Surgeons', 'surg'],
    ['FACC', 'Fellow of the American College of Cardiology', 'card'],
    ['FAHA', 'Fellow of the American Heart Association', 'card'],
    ['FCCP', 'Fellow of the American College of Chest Physicians', 'pulm icu'],
    ['FASN', 'Fellow of the American Society of Nephrology', 'im'],
    ['AGAF', 'Fellow of the American Gastroenterological Association', 'gi'],
    ['FACG', 'Fellow of the American College of Gastroenterology', 'gi'],
    ['FAAAAI', 'Fellow of the American Academy of Allergy, Asthma & Immunology', 'pulm im'],
    ['FAAP', 'Fellow of the American Academy of Pediatrics', 'peds'],
    ['FACOG', 'Fellow of the American College of Obstetricians and Gynecologists', 'obg'],
    ['FASAM', 'Fellow of the American Society of Addiction Medicine', 'psy'],
    ['FASMBS', 'Fellow of the American Society for Metabolic and Bariatric Surgery', 'gs'],
    ['FASCRS', 'Fellow of the American Society of Colon and Rectal Surgeons', 'gs'],
    ['FASE', 'Fellow of the American Society of Echocardiography', 'card'],
    ['FSVS', 'Fellow of the Society for Vascular Surgery', 'gs card'],
    ['FACR', 'Fellow of the American College of Radiology', 'rad onc'],
    ['FAAN', 'Fellow of the American Academy of Neurology', 'neuro'],
    ['FAANS', 'Fellow of the American Association of Neurological Surgeons', 'neuro'],
    ['FAPA', 'Fellow of the American Psychiatric Association', 'psy']
  ],
  canada: [
    ['FRCPC', 'Fellow of the Royal College of Physicians of Canada', 'med peds psy rad'],
    ['FRCSC', 'Fellow of the Royal College of Surgeons of Canada', 'surg obg'],
    ['CCFP', 'Certification in the College of Family Physicians of Canada', 'im'],
    ['FCFP', 'Fellow of the College of Family Physicians of Canada', 'im']
  ],
  anz: [
    ['FRACP', 'Fellow of the Royal Australasian College of Physicians', 'med peds'],
    ['FRACS', 'Fellow of the Royal Australasian College of Surgeons', 'surg'],
    ['FRANZCO', 'Fellow of the Royal Australian and New Zealand College of Ophthalmologists', 'ophth'],
    ['FRANZCOG', 'Fellow of the Royal Australian and New Zealand College of Obstetricians and Gynaecologists', 'obg'],
    ['FRANZCR','Fellow of the Royal Australian and New Zealand College of Radiologists', 'rad onc'],
    ['FRANZCP', 'Fellow of the Royal Australian and New Zealand College of Psychiatrists', 'psy'],
    ['FANZCA', 'Fellow of the Australian and New Zealand College of Anaesthetists', 'icu'],
    ['FACEM', 'Fellow of the Australasian College for Emergency Medicine', 'icu'],
    ['FRACGP', 'Fellow of the Royal Australian College of General Practitioners', 'im'],
    ['FACRRM', 'Fellow of the Australian College of Rural and Remote Medicine', 'im'],
    ['FACD', 'Fellow of the Australasian College of Dermatologists', 'derm'],
    ['FCICM', 'Fellow of the College of Intensive Care Medicine of Australia and New Zealand', 'icu'],
    ['FFPMANZCA', 'Fellow of the Faculty of Pain Medicine, ANZCA', 'icu'],
    ['FACSEP', 'Fellow of the Australasian College of Sport and Exercise Physicians', 'ortho'],
    ['FRNZCGP', 'Fellow of the Royal New Zealand College of General Practitioners', 'im'],
    ['FDRHMNZ', 'Fellow of the Division of Rural Hospital Medicine New Zealand', 'im'],
    ['FAChPM', 'Fellow of the Australasian Chapter of Palliative Medicine', 'onc im'],
    ['FAFRM', 'Fellow of the Australasian Faculty of Rehabilitation Medicine', 'ortho neuro']
  ],
  za: [
    ['FCP(SA)', 'Fellow of the College of Physicians of South Africa', 'med'],
    ['FCS(SA)', 'Fellow of the College of Surgeons of South Africa', 'surg'],
    ['FCOG(SA)', 'Fellow of the College of Obstetricians and Gynaecologists of South Africa', 'obg'],
    ['FCFP(SA)', 'Fellow of the College of Family Physicians of South Africa', 'im'],
    ['FCEM(SA)', 'Fellow of the College of Emergency Medicine of South Africa', 'icu'],
    ['FC Derm(SA)', 'Fellow of the College of Dermatologists of South Africa', 'derm'],
    ['FC Neurol(SA)', 'Fellow of the College of Neurologists of South Africa', 'neuro'],
    ['FC Neurosurg(SA)', 'Fellow of the College of Neurosurgeons of South Africa', 'neuro'],
    ['FC Orth(SA)', 'Fellow of the College of Orthopaedic Surgeons of South Africa', 'ortho'],
    ['FC Ophth(SA)', 'Fellow of the College of Ophthalmologists of South Africa', 'ophth'],
    ['FCORL(SA)', 'Fellow of the College of Otorhinolaryngologists of South Africa', 'gs'],
    ['FC Paed(SA)', 'Fellow of the College of Paediatricians of South Africa', 'peds'],
    ['FC Paed Surg(SA)', 'Fellow of the College of Paediatric Surgeons of South Africa', 'peds gs'],
    ['FC Plast Surg(SA)', 'Fellow of the College of Plastic Surgeons of South Africa', 'gs'],
    ['FC Psych(SA)', 'Fellow of the College of Psychiatrists of South Africa', 'psy'],
    ['FC Rad Diag(SA)', 'Fellow of the College of Radiologists of South Africa in Diagnostic Radiology', 'rad'],
    ['FC Rad Onc(SA)', 'Fellow of the College of Radiation Oncologists of South Africa', 'onc'],
    ['FC Urol(SA)', 'Fellow of the College of Urologists of South Africa', 'uro'],
    ['FCNP(SA)', 'Fellow of the College of Nuclear Physicians of South Africa', 'rad']
  ],
  southasia: [
    ['FCPS', 'Fellow of the College of Physicians and Surgeons', 'all'],
    ['MCPS', 'Member of the College of Physicians and Surgeons', 'all'],
    ['FRCS', 'Fellow of the Royal College of Surgeons', 'surg'],
    ['MRCP', 'Membership of the Royal Colleges of Physicians', 'med'],
    ['MD', 'Doctor of Medicine', 'all'],
    ['MS', 'Master of Surgery', 'surg obg'],
    ['DM', 'Doctor of Medicine, super-specialty qualification', 'med'],
    ['MCh', 'Master of Chirurgiae, super-specialty surgical qualification', 'surg']
  ],
  hksg: [
    ['FHKAM', 'Fellow of the Hong Kong Academy of Medicine', 'all'],
    ['FHKCP', 'Fellow of the Hong Kong College of Physicians', 'med'],
    ['FHKAM (Surgery)', 'Fellow of the Hong Kong Academy of Medicine in Surgery', 'surg'],
    ['FHKCEM', 'Fellow of the Hong Kong College of Emergency Medicine', 'icu'],
    ['FHKCFP', 'Fellow of the Hong Kong College of Family Physicians', 'im'],
    ['FHKCOG', 'Fellow of the Hong Kong College of Obstetricians and Gynaecologists', 'obg'],
    ['FHKCR', 'Fellow of the Hong Kong College of Radiologists', 'rad'],
    ['FHKAM (Paediatrics)', 'Fellowship of the Hong Kong Academy of Medicine in Paediatrics', 'peds'],
    ['FAMS', 'Fellow of the Academy of Medicine, Singapore', 'all'],
    ['MMed', 'Master of Medicine (Singapore)', 'all'],
    ['MRCP (UK)', 'Membership of the Royal Colleges of Physicians', 'med'],
    ['FRCS', 'Fellow of the Royal College of Surgeons', 'surg']
  ],
  europe: [
    ['FESC', 'Fellow of the European Society of Cardiology', 'card'],
    ['FERS', 'Fellow of the European Respiratory Society', 'pulm'],
    ['EDIC', 'European Diploma in Intensive Care', 'icu'],
    ['DESAIC', 'Diploma of the European Society of Anaesthesiology and Intensive Care', 'icu'],
    ['EDAIC', 'European Diploma in Anaesthesiology and Intensive Care', 'icu'],
    ['FEBU', 'Fellow of the European Board of Urology', 'uro'],
    ['FEBS', 'Fellow of the European Board of Surgery', 'gs'],
    ['FEBO', 'Fellow of the European Board of Ophthalmology', 'ophth'],
    ['FEBNM', 'Fellow of the European Board of Nuclear Medicine', 'rad onc'],
    ['EDiR', 'European Diploma in Radiology', 'rad'],
    ['FEFIM', 'Fellow of the European Federation of Internal Medicine', 'im'],
    ['FEBOT', 'Fellow of the European Board of Orthopaedics and Traumatology', 'ortho'],
    ['FEBPRM', 'Fellow of the European Board of Physical and Rehabilitation Medicine', 'ortho neuro'],
    ['FEFSM', 'European sports medicine fellowship', 'ortho'],
    ['FMH', 'Swiss Medical Association specialist title (Switzerland)', 'all'],
    ['Facharzt', 'Specialist physician qualification (Germany / Austria)', 'all'],
    ['DES', "Diplome d'Etudes Specialisees (France)", 'all'],
    ['DESC', "Diplome d'Etudes Specialisees Complementaires (France)", 'all']
  ],
  intl: [
    ['FESC', 'Fellow of the European Society of Cardiology', 'card'],
    ['FACC', 'Fellow of the American College of Cardiology', 'card'],
    ['FAHA', 'Fellow of the American Heart Association', 'card'],
    ['FASE', 'Fellow of the American Society of Echocardiography', 'card'],
    ['FCCP', 'Fellow of the American College of Chest Physicians', 'pulm icu'],
    ['FERS', 'Fellow of the European Respiratory Society', 'pulm'],
    ['FASN', 'Fellow of the American Society of Nephrology', 'im'],
    ['FASGE', 'Fellow of the American Society for Gastrointestinal Endoscopy', 'gi'],
    ['FACG', 'Fellow of the American College of Gastroenterology', 'gi'],
    ['AGAF', 'Fellow of the American Gastroenterological Association', 'gi'],
    ['FAAN', 'Fellow of the American Academy of Neurology', 'neuro'],
    ['FAANS', 'Fellow of the American Association of Neurological Surgeons', 'neuro'],
    ['FACS', 'Fellow of the American College of Surgeons', 'surg'],
    ['FACP', 'Fellow of the American College of Physicians', 'med'],
    ['FASAM', 'Fellow of the American Society of Addiction Medicine', 'psy'],
    ['FIMSA', 'Fellow of the International Medical Sciences Academy', 'all'],
    ['FICM', 'Fellowship of the Indian College of Critical Care Medicine', 'icu']
  ],
  philippines: [
    ['FPCP', 'Fellow of the Philippine College of Physicians', 'med'],
    ['FPCS', 'Fellow of the Philippine College of Surgeons', 'surg']
  ],
  indonesia: [
    ['Sp.1 / Sp.2', 'Specialist / subspecialist medical qualification', 'all']
  ],
  malaysia: [
    ['FRCP', 'Fellow of the Royal College of Physicians', 'med'],
    ['FRCS', 'Fellow of the Royal College of Surgeons', 'surg'],
    ['MRCP', 'Membership of the Royal Colleges of Physicians', 'med'],
    ['FRCR', 'Fellow of the Royal College of Radiologists', 'rad onc']
  ]
};

/* The PDF groups some countries together. The groups above are split here
   so each country is its own entry: shared qualifications are listed under
   every country that uses them, and a few titles belong to one country only. */
(function splitFellowshipGroups() {
  const without = (list, abbrs) => list.filter(e => !abbrs.includes(e[0]));
  const only = (list, abbrs) => list.filter(e => abbrs.includes(e[0]));

  // UK / Ireland
  const irishOnly = ['FRCSI', 'FRCPI', 'MRCPI', 'FRCPI (Paeds)', 'FCAI', 'FFR RCSI'];
  FELLOWSHIPS.ireland = only(FELLOWSHIPS.uk, irishOnly.concat('FRCS'));
  FELLOWSHIPS.uk = without(FELLOWSHIPS.uk, irishOnly);

  // Australia / New Zealand (joint colleges serve both)
  const ausOnly = ['FRACGP', 'FACRRM', 'FACD', 'FACSEP'];
  const nzOnly = ['FRNZCGP', 'FDRHMNZ'];
  FELLOWSHIPS.australia = without(FELLOWSHIPS.anz, nzOnly);
  FELLOWSHIPS.nz = without(FELLOWSHIPS.anz, ausOnly);
  delete FELLOWSHIPS.anz;

  // Bangladesh, Pakistan, Sri Lanka, Nepal (FCPS / MCPS: Bangladesh and Pakistan only)
  FELLOWSHIPS.bangladesh = FELLOWSHIPS.southasia;
  FELLOWSHIPS.pakistan = FELLOWSHIPS.southasia;
  FELLOWSHIPS.srilanka = without(FELLOWSHIPS.southasia, ['FCPS', 'MCPS']);
  FELLOWSHIPS.nepal = FELLOWSHIPS.srilanka;
  delete FELLOWSHIPS.southasia;

  // Hong Kong / Singapore
  const sgOnly = ['FAMS', 'MMed', 'MRCP (UK)', 'FRCS'];
  FELLOWSHIPS.singapore = only(FELLOWSHIPS.hksg, sgOnly);
  FELLOWSHIPS.hongkong = without(FELLOWSHIPS.hksg, sgOnly);
  delete FELLOWSHIPS.hksg;

  // Europe: national titles go to their country; the European board
  // diplomas join the international society fellowships.
  FELLOWSHIPS.germany = only(FELLOWSHIPS.europe, ['Facharzt']);
  FELLOWSHIPS.austria = FELLOWSHIPS.germany;
  FELLOWSHIPS.switzerland = only(FELLOWSHIPS.europe, ['FMH']);
  FELLOWSHIPS.france = only(FELLOWSHIPS.europe, ['DES', 'DESC']);
  const national = ['Facharzt', 'FMH', 'DES', 'DESC'];
  const known = new Set(FELLOWSHIPS.intl.map(e => e[0]));
  FELLOWSHIPS.intl = FELLOWSHIPS.intl.concat(
    without(FELLOWSHIPS.europe, national).filter(e => !known.has(e[0]))
  );
  delete FELLOWSHIPS.europe;

  FELLOWSHIPS.other = [];   // countries not listed: the doctor adds their own
})();

function fellowshipOptionsFor(countryKey, specialty) {
  const expand = tokens => tokens.split(' ').flatMap(t =>
    FELLOWSHIP_SPECIALTY_GROUPS[t] ? FELLOWSHIP_SPECIALTY_GROUPS[t].split(' ') : [t]
  ).map(t => FELLOWSHIP_SPECIALTY_CODES[t]);

  return (FELLOWSHIPS[countryKey] || [])
    .filter(([, , specs]) => specs === 'all' || expand(specs).includes(specialty))
    .map(([abbr, full]) => ({ value: abbr, label: abbr + ' (' + full + ')', triggerLabel: abbr }));
}

const DROPDOWN_CONFIG = {
  gender: {
    title: 'Select Gender',
    icon: 'fa-venus-mars',
    options: ['Male', 'Female', 'Other', 'Prefer not to say']
  },
  registrationCouncil: {
    title: 'Select Registration Council',
    icon: 'fa-landmark',
    // The menu shows the full form; the field itself shows only the short name
    options: [
      { value: 'NMC', label: 'NMC (National Medical Commission)', triggerLabel: 'NMC' },
      { value: 'DCI', label: 'DCI (Dental Council of India)', triggerLabel: 'DCI' }
    ]
  },
  // Options are filled in by updateStateCouncil once NMC or DCI is chosen
  stateCouncil: {
    title: 'Select State Council',
    icon: 'fa-landmark',
    options: []
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
    multi: true,
    maxSelections: 1,
    allowCustom: true,
    placeholder: 'Search sub-speciality',
    addPlaceholder: 'Add your sub-speciality',
    options: [
      'Interventional Cardiology', 'Pediatric Surgery', 'Neuro-Oncology', 'Joint Replacement',
      'Maternal-Fetal Medicine', 'Retina & Vitreous'
    ]
  },
  qualifications: {
    title: 'Select Qualifications',
    icon: 'fa-graduation-cap',
    multi: true,
    allowCustom: true,
    placeholder: 'Search qualification',
    addPlaceholder: 'Add your qualification',
    options: [
      'MBBS', 'MD', 'MS', 'DNB', 'DM', 'MCh', 'BDS', 'MDS', 'BAMS', 'BHMS', 'BUMS',
      'DGO', 'DCH', 'DA', 'DOMS', 'DLO', 'DPM', 'FRCS', 'MRCP', 'FRCP', 'FACS',
      'FICS', 'MRCOG', 'FRCR', 'PhD'
    ]
  },
  registrationYear: {
    title: 'Year of Registration',
    icon: 'fa-calendar-check',
    options: buildRegistrationYearOptions()
  },
  medicalInstitute: {
    title: 'Select Medical Institute',
    icon: 'fa-building-columns',
    options: [
      'AIIMS Delhi', 'CMC Vellore', 'KEM Hospital Mumbai', 'JIPMER',
      'Grant Medical College', 'Maulana Azad Medical College',
      'All India Institute of Medical Sciences, New Delhi',
      'Postgraduate Institute of Medical Education and Research, Chandigarh',
      'Jawaharlal Institute of Postgraduate Medical Education and Research, Puducherry',
      'Sanjay Gandhi Postgraduate Institute of Medical Sciences, Lucknow',
      'Other'
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

const STATE_COUNCILS = {
  NMC: [
    'Andhra Pradesh Medical Council', 'Assam Medical Council', 'Bihar Medical Council',
    'Chhattisgarh Medical Council', 'Delhi Medical Council', 'Goa Medical Council',
    'Gujarat Medical Council', 'Haryana Medical Council', 'Karnataka Medical Council',
    'Kerala State Medical Council', 'Madhya Pradesh Medical Council', 'Maharashtra Medical Council',
    'Odisha Council of Medical Registration', 'Punjab Medical Council', 'Rajasthan Medical Council',
    'Tamil Nadu Medical Council', 'Telangana State Medical Council', 'Uttar Pradesh Medical Council',
    'Uttarakhand Medical Council', 'West Bengal Medical Council'
  ],
  DCI: [
    'Andhra Pradesh State Dental Council', 'Delhi Dental Council', 'Gujarat State Dental Council',
    'Karnataka State Dental Council', 'Kerala State Dental Council', 'Madhya Pradesh Dental Council',
    'Maharashtra State Dental Council', 'Punjab Dental Council', 'Rajasthan Dental Council',
    'Tamil Nadu Dental Council', 'Telangana State Dental Council', 'Uttar Pradesh Dental Council',
    'West Bengal Dental Council'
  ]
};

/* State council stays greyed out until NMC / DCI is chosen, and its list
   depends on which one was picked. Changing the council clears the old pick. */
function updateStateCouncil(council, keepValue) {
  const trigger = document.getElementById('stateCouncilTrigger');
  const hidden = document.getElementById('stateCouncil');
  const text = document.getElementById('stateCouncilText');

  DROPDOWN_CONFIG.stateCouncil.options = STATE_COUNCILS[council] || [];
  trigger.classList.toggle('disabled', !council);

  if (!keepValue) {
    hidden.value = '';
    text.textContent = 'State council';
    text.classList.remove('selected-text');
    text.classList.add('placeholder-text');
    clearFieldError('stateCouncil');
  }
}

/* Years of Experience is not chosen by the doctor; it is worked out from
   the Year of Registration and shown in a read-only field. */
function updateYearsExperience(registrationYear) {
  const hidden = document.getElementById('yearsExperience');
  const display = document.getElementById('yearsExperienceDisplay');
  if (!registrationYear) {
    hidden.value = '';
    display.value = '';
    return;
  }
  const years = new Date().getFullYear() - Number(registrationYear);
  const value = years < 1 ? 'less-than-1' : years > 40 ? '40+' : String(years);
  const match = buildYearsExperienceOptions().find(opt => opt.value === value);
  hidden.value = value;
  display.value = match.label;
}

function buildRegistrationYearOptions() {
  const options = [];
  for (let year = new Date().getFullYear(); year >= 1950; year--) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

/* =========================================================
   Fellowships (optional, up to 5)

   Each block's fields are suffixed "-<index>" ("fellowshipCountry-0",
   "fellowship-0"). A block's fellowship list depends on its own country
   and on the Medical Specialty picked above.
   ========================================================= */
const MAX_FELLOWSHIPS = 5;
let fellowshipIndices = [];

const FELLOWSHIP_COUNTRY_CONFIG = {
  title: 'Select Country of Fellowship',
  icon: 'fa-earth-asia',
  options: FELLOWSHIP_COUNTRIES
};

function newFellowshipConfig() {
  return {
    title: 'Select Fellowship',
    icon: 'fa-award',
    triggerLabel: 'Fellowship',
    multi: true,
    maxSelections: 1,
    allowCustom: true,
    placeholder: 'Search fellowship',
    addPlaceholder: 'Add your fellowship',
    options: []   // filled in by refreshFellowshipOptions
  };
}

function fellowshipFieldIds(i) {
  return ['fellowshipCountry-' + i, 'fellowship-' + i];
}

function generateFellowshipBlockHtml(i) {
  return `
    <div class="clinic-location-block fellowship-block" data-fellowship-index="${i}">
      <div class="location-header"></div>

      <div class="form-row form-row-2">
        <div class="form-group">
          <input type="hidden" id="fellowshipCountry-${i}">
          <div class="custom-select-trigger" id="fellowshipCountry-${i}Trigger" onclick="openDropdownModal('fellowshipCountry-${i}')">
            <span class="trigger-content">
              <i class="fa-solid fa-earth-asia field-icon-inline"></i>
              <span class="placeholder-text" id="fellowshipCountry-${i}Text">Country of Fellowship</span>
            </span>
            <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
          </div>
          <span class="field-error-msg"></span>
        </div>

        <div class="form-group">
          <input type="hidden" id="fellowship-${i}">
          <div class="custom-select-trigger disabled" id="fellowship-${i}Trigger" onclick="openDropdownModal('fellowship-${i}')">
            <span class="trigger-content">
              <i class="fa-solid fa-award field-icon-inline"></i>
              <span class="placeholder-text" id="fellowship-${i}Text">Fellowship</span>
            </span>
            <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
          </div>
          <span class="field-error-msg"></span>
        </div>
      </div>
    </div>`;
}

/* With one block the fields stand alone; with several, each gets a boxed
   header with its number and a remove button. */
function refreshFellowshipHeaders() {
  const multiple = fellowshipIndices.length > 1;
  document.getElementById('fellowshipsContainer').classList.toggle('has-multiple', multiple);

  fellowshipIndices.forEach((i, pos) => {
    const block = document.querySelector('.fellowship-block[data-fellowship-index="' + i + '"]');
    const header = block && block.querySelector('.location-header');
    if (!header) return;
    header.innerHTML = multiple
      ? `<div class="location-header-left"><span class="location-title">Fellowship ${pos + 1}</span></div>
         <button type="button" class="location-remove-btn" onclick="removeFellowship(${i})" aria-label="Remove Fellowship ${pos + 1}" title="Remove this fellowship">
           <i class="fa-solid fa-trash-can"></i>
         </button>`
      : '';
    header.style.display = multiple ? '' : 'none';
  });

  const addBtn = document.getElementById('addFellowshipBtn');
  if (addBtn) addBtn.style.display = fellowshipIndices.length >= MAX_FELLOWSHIPS ? 'none' : 'inline-flex';
}

function addFellowship() {
  if (fellowshipIndices.length >= MAX_FELLOWSHIPS) return null;

  const used = new Set(fellowshipIndices);
  let next = 0;
  while (used.has(next)) next++;
  fellowshipIndices.push(next);

  DROPDOWN_CONFIG['fellowshipCountry-' + next] = FELLOWSHIP_COUNTRY_CONFIG;
  DROPDOWN_CONFIG['fellowship-' + next] = newFellowshipConfig();
  MULTI_SELECTIONS['fellowship-' + next] = [];

  document.getElementById('fellowshipsContainer')
    .insertAdjacentHTML('beforeend', generateFellowshipBlockHtml(next));
  refreshFellowshipHeaders();
  refreshFellowshipOptions(next);

  if (!isRestoringDraft) {
    const block = document.querySelector('.fellowship-block[data-fellowship-index="' + next + '"]');
    if (block) {
      block.classList.add('location-enter');
      block.addEventListener('animationend', () => block.classList.remove('location-enter'), { once: true });
    }
    persistDraft();
  }
  return next;
}

function removeFellowship(i) {
  if (fellowshipIndices.length <= 1) return;

  const block = document.querySelector('.fellowship-block[data-fellowship-index="' + i + '"]');
  const finish = () => {
    fellowshipIndices = fellowshipIndices.filter(idx => idx !== i);
    if (block) block.remove();

    fellowshipFieldIds(i).forEach(id => {
      interactedFields.delete(id);
      delete DROPDOWN_CONFIG[id];
    });
    delete MULTI_SELECTIONS['fellowship-' + i];

    refreshFellowshipHeaders();
    persistDraft();
  };

  if (block) {
    // Same collapse animation as the clinic locations
    block.style.height = block.getBoundingClientRect().height + 'px';
    block.classList.add('location-exit');
    block.getBoundingClientRect();
    requestAnimationFrame(() => block.classList.add('location-exit-active'));
    block.addEventListener('transitionend', finish, { once: true });
  } else {
    finish();
  }
}

/* The fellowship list needs a country and a specialty first; tell the
   doctor which is missing when they try to open it too early. */
function showFellowshipPrerequisiteHint(i) {
  const missingCountry = !document.getElementById('fellowshipCountry-' + i).value;
  const missingSpecialty = !document.getElementById('medicalSpecialty').value;

  const message = missingCountry && missingSpecialty
    ? 'Select your Medical Specialty and the country of fellowship first.'
    : missingCountry
      ? 'Select the country of fellowship first.'
      : 'Select your Medical Specialty above first.';

  setFellowshipHint(i, message);

  // Highlight whichever of the two is still empty
  if (missingCountry) setTriggerHighlight('fellowshipCountry-' + i + 'Trigger', 'Select the country first.');
  if (missingSpecialty) {
    setTriggerHighlight('medicalSpecialtyTrigger', 'Select your Medical Specialty first.');
    // The specialty sits above this section, so bring it into view
    document.getElementById('medicalSpecialtyTrigger')
      .scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function setFellowshipHint(i, message) {
  setTriggerHighlight('fellowship-' + i + 'Trigger', message);
}

/* Red outline + message under a dropdown trigger (empty message clears it) */
function setTriggerHighlight(triggerId, message) {
  const trigger = document.getElementById(triggerId);
  const group = trigger.closest('.form-group');
  const msgEl = group.querySelector('.field-error-msg');
  group.classList.toggle('invalid', !!message);
  trigger.classList.toggle('error', !!message);
  if (message && msgEl) msgEl.textContent = message;
}

/* Rebuilds the fellowship list for one block, or all blocks when no index
   is given (e.g. after the Medical Specialty changes). */
function refreshFellowshipOptions(index) {
  const specialty = document.getElementById('medicalSpecialty').value;
  const indices = index === undefined ? fellowshipIndices : [index];

  indices.forEach(i => {
    const country = document.getElementById('fellowshipCountry-' + i).value;
    const trigger = document.getElementById('fellowship-' + i + 'Trigger');
    const ready = !!(country && specialty);

    const config = DROPDOWN_CONFIG['fellowship-' + i];
    const previousOptions = config.options;
    const options = ready ? fellowshipOptionsFor(country, specialty) : [];
    config.options = options;
    trigger.classList.toggle('disabled', !ready);
    if (ready) setFellowshipHint(i, '');
    if (country) setTriggerHighlight('fellowshipCountry-' + i + 'Trigger', '');
    if (specialty) setTriggerHighlight('medicalSpecialtyTrigger', '');

    // Drop a pick that came from the old list and isn't in the new one;
    // an entry the doctor typed themselves stays
    const current = MULTI_SELECTIONS['fellowship-' + i][0];
    if (current) {
      const wasListed = previousOptions.some(opt => opt.value === current);
      const stillOffered = options.some(opt => opt.value === current);
      if (wasListed && !stillOffered) {
        MULTI_SELECTIONS['fellowship-' + i] = [];
        syncMultiField('fellowship-' + i);
      }
    }
  });
}

function collectFellowships() {
  return fellowshipIndices.map(i => ({
    country: document.getElementById('fellowshipCountry-' + i).value,
    fellowship: MULTI_SELECTIONS['fellowship-' + i][0] || ''
  }));
}

let currentDropdownField = null;
let aboutEditMode = false;
let aboutOriginalValue = '';

/* Selected values for multi-select fields, keyed by field id */
const MULTI_SELECTIONS = {
  qualifications: [],
  medicalSubSpecialty: []
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
    stateCouncil: document.getElementById('stateCouncil').value,
    mciRegdNo: document.getElementById('mciRegdNo').value,
    medicalSpecialty: document.getElementById('medicalSpecialty').value,
    medicalSubSpecialty: MULTI_SELECTIONS.medicalSubSpecialty.slice(),
    yearsExperience: document.getElementById('yearsExperience').value,
    qualifications: MULTI_SELECTIONS.qualifications.slice(),
    registrationYear: document.getElementById('registrationYear').value,
    fellowships: collectFellowships(),
    medicalInstitute: document.getElementById('medicalInstitute').value,
    otherMedicalInstitute: document.getElementById('otherMedicalInstitute').value,
    clinicLocations: collectClinicLocations(),
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

function hasProfilePhoto() {
  return !!document.querySelector('#avatarPreview img');
}

/* Shows the missing-photo error and scrolls the avatar into view */
function flagMissingProfilePhoto() {
  const avatarPreview = document.getElementById('avatarPreview');
  const photoError = document.getElementById('photoError');
  avatarPreview.classList.add('error');
  photoError.textContent = 'Please upload a profile photo.';
  photoError.style.display = 'block';
  avatarPreview.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function applyProfilePhoto(dataUrl) {
  const avatarPreview = document.getElementById('avatarPreview');
  if (!avatarPreview || !dataUrl) return;
  avatarPreview.innerHTML = '';
  avatarPreview.classList.remove('error');
  const photoError = document.getElementById('photoError');
  if (photoError) {
    photoError.style.display = 'none';
    photoError.textContent = '';
  }
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
  const label = match ? (match.triggerLabel || match.label) : value;

  hiddenInput.value = value;
  textEl.textContent = label;
  textEl.classList.remove('placeholder-text');
  textEl.classList.add('selected-text');
  const flags = match && buildOptionFlags(match);
  if (flags) textEl.prepend(flags);

  if (fieldId === 'registrationYear') updateYearsExperience(value);
  if (fieldId === 'medicalSpecialty') refreshFellowshipOptions();
  if (fieldId.startsWith('fellowshipCountry-')) refreshFellowshipOptions(locationIndexOf(fieldId));
  if (fieldId === 'registrationCouncil') {
    updateStateCouncil(value, options && options.keepDependent);
  }

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

/* =========================================================
   Hospital/Clinic Locations (up to 3, one marked default)

   Each location's fields are suffixed "-<index>" (e.g. "pincode-0").
   `locationIndices` holds the indexes currently on screen, in the
   order the doctor added them; `defaultLocationIndex` is which one
   is used for patient communication.
   ========================================================= */
const MAX_CLINIC_LOCATIONS = 3;
let locationIndices = [];
let defaultLocationIndex = 0;

function clinicLocationFieldIds(i) {
  return ['clinicName-' + i, 'clinicAddress-' + i, 'pincode-' + i, 'districtCity-' + i, 'state-' + i];
}

function generateLocationBlockHtml(i) {
  return `
    <div class="clinic-location-block" data-location-index="${i}">
      <div class="location-header"></div>

      <div class="form-row form-row-2">
        <div class="form-group">
          <div class="input-wrapper">
            <input type="text" id="clinicName-${i}" class="form-input has-icon"
              placeholder="Hospital/Clinic Name">
            <i class="fa-solid fa-hospital field-icon"></i>
          </div>
          <span class="field-error-msg">Hospital/Clinic name is required.</span>
        </div>

        <div class="form-group">
          <div class="input-wrapper">
            <input type="text" id="clinicAddress-${i}" class="form-input has-icon"
              placeholder="Address (Street)">
            <i class="fa-solid fa-location-dot field-icon"></i>
          </div>
          <span class="field-error-msg">Address is required.</span>
        </div>
      </div>

      <div class="form-row form-row-3">
        <div class="form-group">
          <div class="input-wrapper">
            <input type="text" id="pincode-${i}" class="form-input has-icon" placeholder="Pincode" inputmode="numeric" maxlength="6">
            <i class="fa-solid fa-map-pin field-icon"></i>
          </div>
          <span class="field-error-msg">Enter a valid 6-digit pincode.</span>
        </div>

        <div class="form-group">
          <div class="input-wrapper">
            <input type="text" id="districtCity-${i}" class="form-input has-icon" placeholder="City / District">
            <i class="fa-solid fa-city field-icon"></i>
          </div>
          <span class="field-error-msg">City / District is required.</span>
        </div>

        <div class="form-group">
          <input type="hidden" id="state-${i}">
          <div class="custom-select-trigger" id="state-${i}Trigger" onclick="openDropdownModal('state-${i}')">
            <span class="trigger-content">
              <i class="fa-solid fa-map-location-dot field-icon-inline"></i>
              <span class="placeholder-text" id="state-${i}Text">Select State</span>
            </span>
            <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
          </div>
          <span class="field-error-msg">This field is required.</span>
        </div>
      </div>
    </div>`;
}

function generateLocationHeaderHtml(i, pos) {
  const isPrimary = defaultLocationIndex === i;
  const title = `<span class="location-title">Location ${pos + 1}</span>`;
  const defaultMarker = `<label class="location-default-radio${isPrimary ? ' is-primary' : ''}">
        <input type="radio" name="defaultLocation" value="${i}" ${isPrimary ? 'checked' : ''} onchange="setDefaultLocation(${i})">
        <span>Set as Primary Location</span>
      </label>`;
  const removeBtn = !isPrimary
    ? `<button type="button" class="location-remove-btn" onclick="removeClinicLocation(${i})" aria-label="Remove Location ${pos + 1}" title="Remove this location">
        <i class="fa-solid fa-trash-can"></i>
      </button>`
    : '';

  return `<div class="location-header-left">${title}${defaultMarker}</div>${removeBtn}`;
}

function refreshLocationHeaders() {
  // With only one location it's trivially the default, so the header
  // (title, "Set as default" radio, remove button) is hidden entirely.
  const multiple = locationIndices.length > 1;

  locationIndices.forEach((i, pos) => {
    const block = document.querySelector('.clinic-location-block[data-location-index="' + i + '"]');
    if (!block) return;
    const header = block.querySelector('.location-header');
    if (!header) return;
    header.innerHTML = multiple ? generateLocationHeaderHtml(i, pos) : '';
    header.style.display = multiple ? '' : 'none';
  });

  const addBtn = document.getElementById('addLocationBtn');
  if (addBtn) addBtn.style.display = locationIndices.length >= MAX_CLINIC_LOCATIONS ? 'none' : 'inline-flex';
}

function wireLocationFieldEvents(i) {
  ['clinicName-' + i, 'clinicAddress-' + i, 'districtCity-' + i].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { markFieldInteracted(id); validateField(id); });
    el.addEventListener('blur', () => { markFieldInteracted(id); validateField(id); });
  });

  const pincodeField = document.getElementById('pincode-' + i);
  pincodeField.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
    markFieldInteracted('pincode-' + i);
    validateField('pincode-' + i);
    if (this.value.length === 6) lookupPincode(this.value, i);
  });
  pincodeField.addEventListener('blur', () => { markFieldInteracted('pincode-' + i); validateField('pincode-' + i); });
}

function addClinicLocation() {
  if (locationIndices.length >= MAX_CLINIC_LOCATIONS) return null;

  const used = new Set(locationIndices);
  let next = 0;
  while (used.has(next)) next++;
  locationIndices.push(next);

  DROPDOWN_CONFIG['state-' + next] = DROPDOWN_CONFIG.state;

  const container = document.getElementById('clinicLocationsContainer');
  container.insertAdjacentHTML('beforeend', generateLocationBlockHtml(next));
  wireLocationFieldEvents(next);
  refreshLocationHeaders();

  if (!isRestoringDraft) {
    const block = document.querySelector('.clinic-location-block[data-location-index="' + next + '"]');
    if (block) {
      block.classList.add('location-enter');
      block.addEventListener('animationend', () => block.classList.remove('location-enter'), { once: true });
    }
  }

  validateForm();
  persistDraft();
  return next;
}

function removeClinicLocation(i) {
  if (locationIndices.length <= 1) return;

  const block = document.querySelector('.clinic-location-block[data-location-index="' + i + '"]');
  const finish = () => {
    locationIndices = locationIndices.filter(idx => idx !== i);
    if (block) block.remove();

    clinicLocationFieldIds(i).forEach(id => interactedFields.delete(id));
    delete pincodeLookups[i];
    delete pincodeLookupTokens[i];
    delete DROPDOWN_CONFIG['state-' + i];

    if (defaultLocationIndex === i) defaultLocationIndex = locationIndices[0];

    refreshLocationHeaders();
    validateForm();
    persistDraft();
  };

  if (block) {
    // Lock in the block's current height as an explicit pixel value so it
    // can be transitioned down to 0 — you can't CSS-transition to/from "auto".
    block.style.height = block.getBoundingClientRect().height + 'px';
    block.classList.add('location-exit');
    block.getBoundingClientRect(); // force layout so the height above "sticks" before collapsing
    requestAnimationFrame(() => block.classList.add('location-exit-active'));
    block.addEventListener('transitionend', finish, { once: true });
  } else {
    finish();
  }
}

function setDefaultLocation(i) {
  defaultLocationIndex = i;
  refreshLocationHeaders();
  persistDraft();
}

function collectClinicLocations() {
  return locationIndices.map((i, pos) => ({
    locationNumber: pos + 1,
    clinicName: document.getElementById('clinicName-' + i).value,
    clinicAddress: document.getElementById('clinicAddress-' + i).value,
    pincode: document.getElementById('pincode-' + i).value,
    districtCity: document.getElementById('districtCity-' + i).value,
    state: document.getElementById('state-' + i).value,
    isDefault: i === defaultLocationIndex
  }));
}

function getRequiredFieldIds() {
  const locationFields = [];
  locationIndices.forEach(i => locationFields.push(...clinicLocationFieldIds(i)));
  return REQUIRED_FIELDS.concat(locationFields);
}

/* Turns "pincode-2" into 2, or null for a non-location field id */
function locationIndexOf(id) {
  const match = /-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/* Strips the "-<index>" suffix so shared validation logic can be
   written once (e.g. "pincode-2" and "pincode" share the same rules) */
function baseFieldName(id) {
  const match = /^(.*)-(\d+)$/.exec(id);
  return match ? match[1] : id;
}

/* -------------------------------------------------------
   Pincode -> City/District + State auto-fill (India Post API)
   ------------------------------------------------------- */
const pincodeLookupTokens = {};

// One lookup-state object per location index: which pin the state
// applies to, and whether it's mid-flight, failed, or settled.
const pincodeLookups = {}; // index -> { pin, status: 'idle' | 'loading' | 'not-found' }

function getPincodeLookup(i) {
  if (!pincodeLookups[i]) pincodeLookups[i] = { pin: null, status: 'idle' };
  return pincodeLookups[i];
}

function renderPincodeLookup(i) {
  const lookup = getPincodeLookup(i);
  const cityField = document.getElementById('districtCity-' + i);
  const stateText = document.getElementById('state-' + i + 'Text');
  const loading = lookup.status === 'loading';

  if (cityField) {
    if (loading) cityField.value = '';
    cityField.placeholder = loading ? 'Fetching...' : 'City / District';
  }
  if (stateText) {
    if (loading) {
      stateText.textContent = 'Fetching...';
      stateText.classList.add('placeholder-text');
      stateText.classList.remove('selected-text');
      document.getElementById('state-' + i).value = '';
    } else if (stateText.textContent === 'Fetching...') {
      stateText.textContent = 'Select State';
    }
  }

  validateField('pincode-' + i, lookup.status === 'not-found');
}

async function lookupPincode(pin, i) {
  const token = (pincodeLookupTokens[i] || 0) + 1;
  pincodeLookupTokens[i] = token;
  const lookup = getPincodeLookup(i);
  lookup.pin = pin;
  lookup.status = 'loading';
  renderPincodeLookup(i);

  try {
    const res = await fetch('https://api.postalpincode.in/pincode/' + pin);
    if (!res.ok) {
      lookup.status = 'not-found';
      return;
    }
    const data = await res.json();
    if (pincodeLookupTokens[i] !== token) return; // a newer lookup has started

    const result = Array.isArray(data) ? data[0] : null;
    if (!result || result.Status !== 'Success' || !Array.isArray(result.PostOffice) || !result.PostOffice.length) {
      lookup.status = 'not-found';
      return;
    }

    lookup.status = 'idle';
    const office = result.PostOffice[0];

    const cityField = document.getElementById('districtCity-' + i);
    if (cityField && office.District) {
      cityField.value = office.District;
      markFieldInteracted('districtCity-' + i);
      validateField('districtCity-' + i);
    }

    if (office.State) {
      const stateMatch = DROPDOWN_CONFIG.state.options
        .find(opt => opt.toLowerCase() === office.State.toLowerCase());
      applySingleSelect('state-' + i, stateMatch || 'Other');
      markFieldInteracted('state-' + i);
      validateField('state-' + i);
    }
  } catch (err) {
    lookup.status = 'idle'; // network failure: leave fields as-is for manual entry
  } finally {
    if (pincodeLookupTokens[i] === token) renderPincodeLookup(i);
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
      const textIds = ['firstName', 'email', 'mciRegdNo'];
      textIds.forEach(id => {
        if (typeof draft[id] === 'string') document.getElementById(id).value = draft[id];
      });

      // About Section holds HTML, so it goes through the editor
      // (which sanitizes it) rather than straight into the textarea.
      if (typeof draft.aboutSection === 'string') setRteContent(draft.aboutSection);

      // Years of Experience is recalculated from registrationYear here.
      ['gender', 'medicalSpecialty', 'registrationYear', 'medicalInstitute']
        .forEach(id => applySingleSelect(id, draft[id] || ''));

      // Fellowships come after the specialty, which decides their lists
      if (Array.isArray(draft.fellowships) && draft.fellowships.length) {
        while (fellowshipIndices.length < draft.fellowships.length) addFellowship();
        draft.fellowships.forEach((f, pos) => {
          const i = fellowshipIndices[pos];
          if (i === undefined) return;
          // Drafts saved with the old grouped countries (e.g. "anz") no longer match
          if (FELLOWSHIP_COUNTRIES.some(c => c.value === f.country)) applySingleSelect('fellowshipCountry-' + i, f.country);
          if (f.fellowship) {
            MULTI_SELECTIONS['fellowship-' + i] = [f.fellowship];
            syncMultiField('fellowship-' + i);
          }
        });
      }

      // Older drafts stored the council as a list (and as "MCI", now NMC)
      let savedCouncil = Array.isArray(draft.registrationCouncil)
        ? draft.registrationCouncil[0]
        : draft.registrationCouncil;
      if (savedCouncil === 'MCI') savedCouncil = 'NMC';
      applySingleSelect('registrationCouncil', savedCouncil || '');
      if (savedCouncil && draft.stateCouncil) {
        applySingleSelect('stateCouncil', draft.stateCouncil);
      }

      if (Array.isArray(draft.clinicLocations) && draft.clinicLocations.length) {
        // The form already has one blank location from initial load;
        // add more to match the saved draft before filling in values.
        while (locationIndices.length < draft.clinicLocations.length) addClinicLocation();

        draft.clinicLocations.forEach((loc, pos) => {
          const i = locationIndices[pos];
          if (i === undefined) return;
          document.getElementById('clinicName-' + i).value = loc.clinicName || '';
          document.getElementById('clinicAddress-' + i).value = loc.clinicAddress || '';
          document.getElementById('pincode-' + i).value = loc.pincode || '';
          document.getElementById('districtCity-' + i).value = loc.districtCity || '';
          if (loc.state) applySingleSelect('state-' + i, loc.state);
          if (loc.isDefault) defaultLocationIndex = i;
        });
        refreshLocationHeaders();
      }

      if (draft.medicalInstitute === 'Other' && typeof draft.otherMedicalInstitute === 'string') {
        document.getElementById('otherMedicalInstitute').value = draft.otherMedicalInstitute;
      }

      ['qualifications', 'medicalSubSpecialty'].forEach(fieldId => {
        const draftValue = draft[fieldId];
        if (Array.isArray(draftValue)) {
          MULTI_SELECTIONS[fieldId] = draftValue.slice();
          syncMultiField(fieldId);
        } else if (typeof draftValue === 'string' && draftValue) {
          MULTI_SELECTIONS[fieldId] = [draftValue];
          syncMultiField(fieldId);
        }
      });

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

  // A greyed-out field (State council before a council is picked) can't be opened
  if (document.getElementById(fieldId + 'Trigger').classList.contains('disabled')) {
    if (fieldId.startsWith('fellowship-')) showFellowshipPrerequisiteHint(locationIndexOf(fieldId));
    return;
  }

  currentDropdownField = fieldId;

  const backdrop = document.getElementById('selectModalBackdrop');
  const searchInput = document.getElementById('modalSearchInput');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitleText = document.getElementById('modalTitleText');
  const addRow = document.getElementById('modalAddRow');

  modalIcon.className = 'fa-solid ' + config.icon;
  modalTitleText.textContent = config.title;
  searchInput.value = '';
  searchInput.placeholder = config.placeholder || 'Search...';
  addRow.classList.toggle('active', !!config.allowCustom);

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

  const config = currentDropdownField ? DROPDOWN_CONFIG[currentDropdownField] : null;
  const showDone = !!config && config.multi
    && MULTI_SELECTIONS[currentDropdownField].length > 0;

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
  if (searchBarInAddMode) {
    updateSearchSaveButton(!!inputEl.value.trim());
    return;
  }
  renderModalOptions(config, inputEl.value);
}

function updateSearchSaveButton(show) {
  const btn = document.getElementById('searchSaveBtn');
  if (!btn) return;
  btn.classList.toggle('visible', !!show);
  btn.tabIndex = show ? 0 : -1;
  btn.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function handleSearchSaveClick() {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config || !config.allowCustom) return;
  const inputEl = document.getElementById('modalSearchInput');
  addCustomFromSearch(currentDropdownField, config, inputEl.value);
}

function handleModalSearchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config) return;

  const inputEl = document.getElementById('modalSearchInput');
  const typed = inputEl.value.trim();
  if (!typed) return;

  if (searchBarInAddMode) {
    if (config.allowCustom) addCustomFromSearch(currentDropdownField, config, typed);
    return;
  }

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

  const config = DROPDOWN_CONFIG[fieldId];
  if (config && config.maxSelections && selected.length >= config.maxSelections) {
    selected.length = 0;
  }

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
  if (fieldId === currentDropdownField) updateModalCloseButton();
}

function renderTriggerChips(fieldId) {
  const textEl = document.getElementById(fieldId + 'Text');
  const selected = MULTI_SELECTIONS[fieldId];
  const config = DROPDOWN_CONFIG[fieldId];

  if (selected.length === 0) {
    textEl.className = 'placeholder-text';
    textEl.textContent = config.triggerLabel || config.title.replace(/^Select /, '');
    return;
  }

  // Fields capped at one selection read like a normal single-select field
  // (plain text), instead of the removable-chip look multi-select uses.
  if (config.maxSelections === 1) {
    textEl.className = 'selected-text';
    textEl.textContent = selected[0];
    const trigger = document.getElementById(fieldId + 'Trigger');
    if (trigger) trigger.title = selected[0];
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

  // Fields capped at one selection show their custom entry inline in the
  // options list (with its own remove button) instead of a chip row here.
  if (!config || !config.multi || config.maxSelections === 1) {
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
  renderModalChips();

  // Fields capped at one selection: return to the list view immediately
  // instead of leaving the box open for further adds.
  if (config.maxSelections && MULTI_SELECTIONS[fieldId].length >= config.maxSelections
    && currentDropdownField === fieldId && searchBarInAddMode) {
    toggleSearchAddMode();
    return;
  }

  const searchInput = document.getElementById('modalSearchInput');
  searchInput.value = '';
  updateSearchSaveButton(false);
  if (!searchBarInAddMode) renderModalOptions(config, '');
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

let searchBarInAddMode = false;

function resetSearchBarMode() {
  searchBarInAddMode = false;

  const icon = document.getElementById('modalSearchIcon');
  if (icon) icon.className = 'fa-solid fa-magnifying-glass search-icon';

  const toggleBtn = document.getElementById('modalAddToggleBtn');
  const toggleIcon = document.getElementById('modalAddToggleIcon');
  const toggleLabel = document.getElementById('modalAddToggleLabel');
  if (toggleBtn) toggleBtn.classList.remove('active');
  if (toggleIcon) toggleIcon.className = 'fa-solid fa-plus';
  if (toggleLabel) toggleLabel.textContent = 'Add';

  const list = document.getElementById('modalOptionsList');
  if (list) list.hidden = false;

  const searchBox = document.getElementById('modalSearchBox');
  if (searchBox) searchBox.classList.remove('add-mode');

  updateSearchSaveButton(false);
}

/* Switches the search bar between "search the list" and "type a new entry" */
function toggleSearchAddMode() {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config) return;

  searchBarInAddMode = !searchBarInAddMode;

  const searchInput = document.getElementById('modalSearchInput');
  const icon = document.getElementById('modalSearchIcon');
  const toggleBtn = document.getElementById('modalAddToggleBtn');
  const toggleIcon = document.getElementById('modalAddToggleIcon');
  const toggleLabel = document.getElementById('modalAddToggleLabel');
  const list = document.getElementById('modalOptionsList');
  const searchBox = document.getElementById('modalSearchBox');

  searchInput.value = '';
  updateSearchSaveButton(false);

  if (searchBarInAddMode) {
    searchInput.placeholder = config.addPlaceholder || 'Type to add';
    icon.className = 'fa-solid fa-pen search-icon';
    toggleBtn.classList.add('active');
    toggleIcon.className = 'fa-solid fa-xmark';
    toggleLabel.textContent = 'Cancel';
    list.hidden = true;
    searchBox.classList.add('add-mode');
  } else {
    searchInput.placeholder = config.placeholder || 'Search...';
    icon.className = 'fa-solid fa-magnifying-glass search-icon';
    toggleBtn.classList.remove('active');
    toggleIcon.className = 'fa-solid fa-plus';
    toggleLabel.textContent = 'Add';
    list.hidden = false;
    searchBox.classList.remove('add-mode');
    renderModalOptions(config, '');
  }

  searchInput.focus();
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
  const knownValues = new Set(optionList.map(opt => dedupeKey(opt.value)));

  if (!isMulti && config.allowCustom && currentValue) {
    const isKnown = optionList.some(opt => dedupeKey(opt.value) === dedupeKey(currentValue));
    if (!isKnown) optionList = [{ value: currentValue, label: currentValue }].concat(optionList);
  }

  // Fields capped at one selection: surface a saved custom entry as a
  // regular list row (with a remove button) rather than a separate chip.
  if (isMulti && config.maxSelections === 1 && config.allowCustom && selected.length > 0) {
    const customValue = selected[0];
    if (!knownValues.has(dedupeKey(customValue))) {
      optionList = [{ value: customValue, label: customValue }].concat(optionList);
    }
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

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'No matches';
    list.appendChild(li);
    return;
  }

  filtered.forEach(opt => {
    const li = document.createElement('li');
    li.dataset.value = opt.value;

    const isCustomEntry = isMulti && config.maxSelections === 1
      && config.allowCustom && !knownValues.has(dedupeKey(opt.value));

    if (isCustomEntry) {
      li.classList.add('has-remove');

      const label = document.createElement('span');
      label.className = 'option-label';
      label.textContent = opt.label;
      li.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'option-remove';
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.title = 'Remove ' + opt.label;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMultiValue(currentDropdownField, opt.value);
      });
      li.appendChild(removeBtn);
    } else {
      const flags = buildOptionFlags(opt);
      if (flags) {
        const main = document.createElement('span');
        main.className = 'option-main';
        main.appendChild(flags);
        main.appendChild(document.createTextNode(opt.label));
        li.appendChild(main);
      } else {
        li.textContent = opt.label;
      }
    }

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
  'firstName', 'email', 'phone', 'gender', 'registrationCouncil', 'stateCouncil', 'mciRegdNo',
  'medicalSpecialty', 'qualifications', 'registrationYear'
];


function getFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  const value = el.value.trim();

  switch (baseFieldName(id)) {
    case 'gender':
    case 'registrationCouncil':
    case 'stateCouncil':
    case 'medicalSpecialty':
    case 'yearsExperience':
    case 'registrationYear':
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

    case 'pincode': {
      if (!value) return 'Pincode is required.';
      if (!/^\d{6}$/.test(value)) return 'Enter a valid 6-digit pincode.';
      const idx = locationIndexOf(id);
      const lookup = idx !== null ? pincodeLookups[idx] : null;
      if (lookup && lookup.status === 'not-found' && value === lookup.pin) return 'Pincode not found.';
      break;
    }

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

  getRequiredFieldIds().forEach(id => {
    if (getFieldError(id)) isValid = false;
  });

  const instituteSelect = document.getElementById('medicalInstitute');
  if (instituteSelect.value === 'Other' && getFieldError('otherMedicalInstitute')) isValid = false;

  if (getFieldError('aboutSection')) isValid = false;

  if (!hasProfilePhoto()) isValid = false;

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
  const idsToCheck = getRequiredFieldIds().concat(['otherMedicalInstitute', 'aboutSection']);
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

  // The photo sits at the top of the form, so it is flagged first
  if (!hasProfilePhoto()) {
    flagMissingProfilePhoto();
    return;
  }

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
    stateCouncil: document.getElementById('stateCouncil').value,
    mciRegdNo: document.getElementById('mciRegdNo').value.trim(),
    medicalSpecialty: document.getElementById('medicalSpecialty').value,
    medicalSubSpecialty: MULTI_SELECTIONS.medicalSubSpecialty.slice(),
    yearsExperience: document.getElementById('yearsExperience').value,
    qualifications: MULTI_SELECTIONS.qualifications.slice(),
    registrationYear: document.getElementById('registrationYear').value,
    fellowships: collectFellowships()
      .filter(f => f.fellowship)
      .map(f => {
        const country = FELLOWSHIP_COUNTRIES.find(c => c.value === f.country);
        return { country: country ? country.label : '', fellowship: f.fellowship };
      }),
    medicalInstitute: document.getElementById('medicalInstitute').value === 'Other'
      ? document.getElementById('otherMedicalInstitute').value.trim()
      : document.getElementById('medicalInstitute').value,
    clinicLocations: collectClinicLocations().map(loc => ({
      locationNumber: loc.locationNumber,
      clinicName: loc.clinicName.trim(),
      clinicAddress: loc.clinicAddress.trim(),
      pincode: loc.pincode.trim(),
      districtCity: loc.districtCity.trim(),
      state: loc.state,
      isDefault: loc.isDefault
    })),
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
  body.scrollTop = 0;

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
