import './_libs/axios.js';
import './_libs/jquery.js';
import './_libs/moment.js';
import './_libs/chartjs/chart.umd.js';
import Fields from './formfields.js';

export const log = console.log;
export const jq = jQuery;
export const axios = window.axios;

// Show Bootstrap alerts
export function showAlert(type, message) {
  const box = document.getElementById("alertBox");
  box.className = `alert alert-${type}`;
  box.textContent = message;
  box.classList.remove("d-none");
  setTimeout(() => box.classList.add("d-none"), 4000);
}

// Get token/user from localStorage
export function getAuthToken() {
  return localStorage.getItem("token");
}

export function getAuthUser() {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : {};
}

export async function advanceQuery({ key, values = [], type = null, srchterm = null, qry = null }) {
  try {
    if (!key) throw "Invalid Query";
    let rsp = await axios.post("/advancequery", { key, values, type, srchterm, qry });
    // if (!rsp.data.data.length) return false;
    return rsp.data;
  } catch (error) {
    log(error);
  }
}

export function createForm(title, formId = 'myForm', formData = {}) {
  const formConfig = Fields[title];
  if (!formConfig) {
    console.error(`Form config for "${title}" not found.`);
    return '';
  }

  const visibleFields = Object.entries(formConfig).filter(([_, cfg]) => cfg.type !== 'hidden');
  const hiddenFields = Object.entries(formConfig).filter(([_, cfg]) => cfg.type === 'hidden');

  const hasFileField = visibleFields.some(([_, cfg]) => cfg.type === 'file');

  let formHtml = `<form id="${formId}" novalidate ${hasFileField ? 'enctype="multipart/form-data"' : ''}><div class="row g-3">`;

  const twoCol = visibleFields.length > 6;
  const colClass = twoCol ? 'col-md-6' : 'col-12';

  for (const [name, config] of visibleFields) {
    const type = (config.type || 'text').toLowerCase();
    const id = `${formId}-${name}`;
    const required = config.required ? 'required' : '';
    const value = formData[name] ?? config.default ?? '';
    const titleAttr = config.required ? `title="${config.label} is required"` : '';
    let fieldHtml = '';

    switch (type) {
      case 'text':
      case 'email':
      case 'number':
      case 'date':
      case 'password': {
        fieldHtml = `
          <div class="${colClass}">
            <div class="form-floating">
              <input type="${type}" 
                     class="form-control" 
                     id="${id}" 
                     name="${name}" 
                     value="${value}" 
                     placeholder="${config.label}"
                     ${required} ${titleAttr}>
              <label for="${id}">${config.label}</label>
            </div>
          </div>`;
        break;
      }

      case 'textarea': {
        fieldHtml = `
          <div class="${colClass}">
            <div class="form-floating">
              <textarea class="form-control" 
                        id="${id}" 
                        name="${name}" 
                        placeholder="${config.label}"
                        style="height: 100px"
                        ${required} ${titleAttr}>${value}</textarea>
              <label for="${id}">${config.label}</label>
            </div>
          </div>`;
        break;
      }

      case 'select': {
        const options = (config.options || [])
          .map(opt => {
            if (typeof opt === 'object' && opt !== null) {
              const selected = (opt.id === value) ? 'selected' : '';
              return `<option value="${opt.id}" ${selected}>${opt.value}</option>`;
            } else {
              const selected = (opt === value) ? 'selected' : '';
              return `<option value="${opt}" ${selected}>${opt}</option>`;
            }
          }).join('');

        fieldHtml = `
          <div class="${colClass}">
            <div class="form-floating">
              <select class="form-select" id="${id}" name="${name}" ${required} ${titleAttr}>
                ${options}
              </select>
              <label for="${id}">${config.label}</label>
            </div>
          </div>`;
        break;
      }

      case 'radio': {
        const radios = (config.options || [])
          .map(opt => {
            const checked = (opt === value) ? 'checked' : '';
            return `
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" 
                       name="${name}" id="${id}-${opt}" value="${opt}" ${checked}>
                <label class="form-check-label" for="${id}-${opt}">
                  ${opt}
                </label>
              </div>`;
          }).join('');
        fieldHtml = `
          <div class="${colClass}">
            <label class="form-label d-block">${config.label}</label>
            ${radios}
          </div>`;
        break;
      }

      case 'checkbox': {
        const defaults = Array.isArray(value) ? value : [value];
        const checkboxes = (config.options || [])
          .map(opt => {
            const checked = defaults.includes(opt) ? 'checked' : '';
            return `
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" 
                       name="${name}[]" id="${id}-${opt}" value="${opt}" ${checked}>
                <label class="form-check-label" for="${id}-${opt}">
                  ${opt}
                </label>
              </div>`;
          }).join('');
        fieldHtml = `
          <div class="${colClass}">
            <label class="form-label d-block">${config.label}</label>
            ${checkboxes}
          </div>`;
        break;
      }

      case 'file': {
        let previewHtml = `<div class="mt-2" id="${id}-preview"></div>`;
        if (value) {
          const files = Array.isArray(value) ? value : [value];
          previewHtml = `<div class="mt-2" id="${id}-preview">` +
            files.map(file => {
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file);
              if (isImage) {
                return `<img src="${file}" alt="Preview" class="img-thumbnail me-2 mb-2" style="max-width: 150px; height: auto;">`;
              } else {
                return `<small class="text-muted d-block">Current file: 
                          <a href="${file}" target="_blank">${file.split('/').pop()}</a>
                        </small>`;
              }
            }).join('') +
            `</div>`;
        }

        fieldHtml = `
          <div class="${colClass}">
            <label for="${id}" class="form-label">${config.label}</label>
            <input type="file" class="form-control" id="${id}" name="${name}[]" multiple ${required} ${titleAttr}>
            ${previewHtml}
          </div>`;
        break;
      }

      default: {
        fieldHtml = `
          <div class="${colClass}">
            <div class="form-floating">
              <input type="text" class="form-control" id="${id}" name="${name}" 
                     value="${value}" placeholder="${config.label}" ${required} ${titleAttr}>
              <label for="${id}">${config.label}</label>
            </div>
          </div>`;
        break;
      }
    }

    formHtml += fieldHtml;
  }

  formHtml += `</div>`;

  hiddenFields.forEach(([name, cfg]) => {
    const id = `${formId}-${name}`;
    const value = formData[name] ?? cfg.default ?? '';
    formHtml += `<input type="hidden" id="${id}" name="${name}" value="${value}">`;
  });

  formHtml += `<div class="mt-3"><button type="submit" class="btn btn-primary">Submit</button></div></form>`;

  // multiple file preview
  setTimeout(() => {
    document.querySelectorAll(`#${formId} input[type="file"]`).forEach(input => {
      input.addEventListener('change', function () {
        const preview = document.getElementById(this.id + '-preview');
        if (!preview) return;
        preview.innerHTML = '';
        Array.from(this.files).forEach(file => {
          if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.className = 'img-thumbnail me-2 mb-2';
            img.style.maxWidth = '150px';
            img.onload = () => URL.revokeObjectURL(img.src);
            preview.appendChild(img);
          } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(file);
            link.target = '_blank';
            link.textContent = file.name;
            const wrapper = document.createElement('div');
            wrapper.className = 'small text-muted mt-1';
            wrapper.appendChild(document.createTextNode('Selected File: '));
            wrapper.appendChild(link);
            preview.appendChild(wrapper);
          }
        });
      });
    });
  });

  return formHtml;
}