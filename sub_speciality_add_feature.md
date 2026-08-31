# Add Sub-specialty Feature — Code Reference

All changes live in `onboarding_form.js` (no HTML or CSS changes were required — the
feature reuses the existing modal markup `#modalOptionsList` and the CSS classes
already defined for the Qualifications field: `.static-other-row`,
`.custom-add-form-row`, `.custom-add-form`, `.custom-add-input`,
`.custom-add-save-btn`).

Related change: the old "Other" → separate text-box pattern was removed from both
Medical Specialty and Medical Sub-specialty (see commit `8449f92`,
"Replace medical specialty free-text with custom sub-specialty entry").

---

## 1. Config — enables the add-row for this field (lines 196–205)

```js
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
```

## 2. "Add other..." row (lines 749–766)

```js
function renderStaticAddRow(list, config) {
  const li = document.createElement('li');
  li.className = 'static-other-row';

  const label = document.createElement('span');
  label.className = 'static-other-label';
  const separator = currentDropdownField === 'medicalSubSpecialty' ? '<br>' : ' ';
  label.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Add other '
    + config.title.replace(/^Select /i, '').toLowerCase()
    + separator + '(if not present in the list)';
  li.appendChild(label);

  li.addEventListener('click', () => {
    customAddRowOpen = true;
    const searchVal = document.getElementById('modalSearchInput').value;
    renderModalOptions(config, searchVal);
  });
  list.appendChild(li);
```

## 3. Inline input + Save form (lines 769–815)

```js
function renderCustomAddForm(list, config) {
  const li = document.createElement('li');
  li.className = 'static-other-row custom-add-form-row';

  const form = document.createElement('div');
  form.className = 'custom-add-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'custom-add-input';
  input.placeholder = 'Type ' + config.title.replace(/^Select /i, '').replace(/^Medical /i, '').toLowerCase() + '...';
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
```

## 4. Committing the value — single-select branch + helper (lines 817–849)

```js
function saveCustomQualification(inputEl) {
  const config = DROPDOWN_CONFIG[currentDropdownField];
  if (!config || !config.allowCustom) return;

  const typed = inputEl.value.trim();
  if (!typed) return;

  // Single-select fields take exactly one custom value and close immediately
  if (!config.multi) {
    const value = canonicalize(currentDropdownField, typed.replace(/\s+/g, ' '));
    applySingleCustomValue(currentDropdownField, value);
    customAddRowOpen = false;
    closeDropdownModal();
    return;
  }

  commitCustomEntries(currentDropdownField, typed);
  customAddRowOpen = false;
  renderModalChips();
  renderModalOptions(config, document.getElementById('modalSearchInput').value);
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
```

## 5. Making the saved custom value reappear on reopen (lines 859–884)

```js
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

  let optionList = config.options.map(normalizeOption);

  if (!isMulti && config.allowCustom && currentValue) {
    const isKnown = optionList.some(opt => dedupeKey(opt.value) === dedupeKey(currentValue));
    if (!isKnown) optionList = [{ value: currentValue, label: currentValue }].concat(optionList);
  }

  const filtered = optionList
```

---

## Execution order

1. Config flag (`allowCustom: true`) turns on the add-row for `medicalSubSpecialty`.
2. `renderStaticAddRow` draws the clickable "Add other medical sub-specialty
   (if not present in the list)" row.
3. Clicking it swaps in `renderCustomAddForm` — a text input + Save button.
4. Pressing Enter or clicking Save calls `saveCustomQualification`, which (since
   `medicalSubSpecialty` is not `multi`) takes the single-select branch: commits
   the typed value via `applySingleCustomValue` and closes the modal.
5. Reopening the modal calls `renderModalOptions` again, which now detects the
   saved custom value isn't in `config.options` and re-injects it at the top of
   the list, marked selected.
