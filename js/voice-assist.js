(function ($, Drupal, drupalSettings) {
  /* -----------------------
   Variables
   ----------------------- */
  let recog, isRunning = false, fields = [], index = 0;
  const synth = window.speechSynthesis;
  const processedRepeatables = new Set();
  /* -----------------------
     Utility / persistence
     ----------------------- */
  function checkSkip(val) {
    return ['skip', 'leave it', 'ignore', 'no', 'move on', 'next'].some(k => val.toLowerCase().includes(k));
  }
  /* -----------------------
     Helper functions
     ----------------------- */

  //  speech helpers
  function speak(text, cb) {
    fetch(Drupal.url('voice-assist/voice'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
      .then(res => res.ok ? res.blob() : Promise.reject())
      .then(blob => {
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onended = cb;
        audio.play();
      })
      .catch(() => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.onend = cb;
        synth.speak(utter);
      });
  }

  function listen(cb) {
    recog = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recog.lang = 'en-US';
    recog.start();
    recog.onresult = e => cb(e.results[0][0].transcript.trim());
    recog.onerror = () => cb('');
  }



  // helpers
  function getLabel(wrapper, $el, isSubfield = false, index = null) {
    let label = '';

    if (!isSubfield) {
      // Existing single-field logic
      const heading = wrapper.find('h4.form-item__label:visible, legend:visible').first();
      if (heading.length) return heading.text().trim();

      const visibleLabel = wrapper.find('label:not(.visually-hidden):visible').first();
      if (visibleLabel.length) return visibleLabel.text().trim();

      return $el.attr('placeholder') || $el.attr('name') || $el.attr('id') || '';
    } else {
      // Multivalue subfield logic
      // Try closest visible label for the specific sub-input
      const visibleLabel = $el.closest('.form-item')
        .find('label:not(.visually-hidden):visible').first();

      if (visibleLabel.length) {
        label = visibleLabel.text().trim();
      }
      return label || '';
    }
  }



  function isFieldFilled($el, type) {
    if (type === 'ckeditor5') {
      return $el.val()?.trim()?.length > 0;
    }
    if (type === 'select') {
      return !!$el.val();
    }
    if (type === 'checkbox') {
      return $el.prop('checked');
    }
    return $el.val()?.trim()?.length > 0;
  }





  function getWrappers(wrapper = 'form.node-form') {
    const wrappers = [];
    const seen = new Set();

    $(wrapper).find('input, textarea, select, .ck-editor__editable_inline').each(function () {
      const $el = $(this);
      if (!$el.is(":visible")) return;
      const wrapper = $el.closest("div[class*=field--name-]")[0];
      if (!wrapper) return;

      let isNested = false;
      for (const addedWrapper of wrappers) {
        if (addedWrapper.contains(wrapper) && addedWrapper !== wrapper) {
          isNested = true;
          break;
        }
      }

      if (!isNested && !seen.has(wrapper)) {
        seen.add(wrapper);
        wrappers.push(wrapper);
      }
    });

    return wrappers;  // <--- add this
  }

  function waitForNewFields(prevCount, done) {
    const maxTries = 30;
    let tries = 0;
    const interval = setInterval(() => {
      const newCount = getVisibleFields().length;
      if (newCount > prevCount || tries++ >= maxTries) {
        clearInterval(interval);
        fields = getVisibleFields();
        done();
      }
    }, 500);
  }


    const fillFieldValue = (fld, callback) => {
    askQuestion(fld.label, 'question', '', question => {
      speak(question, () => {
        listen(val => {
          // Skip logic here
          if (checkSkip(val)) {
            speak(`Skipping ${fld.label}`);
            if (callback) callback();
            return;
          }

          askQuestion(fld.label, 'interpret', val, interpreted => {
            const finalVal = interpreted?.value || interpreted || val;
            const $el = $(fld.element);

            if (fld.type === 'ckeditor5') {
              const ed = fld.$editorDiv?.get(0);
              const inst = ed?.ckeditorInstance || $(ed).data("ckeditorInstance");
              if (inst?.setData) inst.setData(finalVal);
              else $(ed).html(finalVal).trigger("input").trigger("change");
            } else if (fld.type === 'select') {
              $el.find('option').each(function () {
                if (finalVal.toLowerCase().includes($(this).text().toLowerCase())) {
                  $(this).prop('selected', true).trigger('change');
                }
              });
            } else if (fld.type === 'checkbox') {
              $el.prop('checked', ['yes', 'true'].includes(finalVal.toLowerCase()));
            } else {
              $el.val(finalVal).trigger('input').trigger('change');
            }

            if (callback) callback();
          });
        });
      });
    });
  };


  /* -----------------------
 Field scanning and tree processing
 ----------------------- */

  function getVisibleFields() {
    const result = {};
    const wrappers = getWrappers();

    wrappers.forEach(wrapper => {
      const $wrapper = $(wrapper);
      const fieldName = $wrapper.attr('class').match(/field--name-([\w-]+)/)[1]; // e.g. "title", "field-company-adjectives"

      const isRepeatable = $wrapper.find('.form-item--multiple').length > 0;

      if (!isRepeatable) {
        // Single field
        const $input = $wrapper.find('input, textarea, select, .ck-editor__editable_inline').first();
        if ($input.length === 0) return;
        if (['Text format', 'Revision log message', 'Published'].some(l => getLabel($wrapper, $input).includes(l))) return;

        const type = $input.attr('type') || $input[0].tagName.toLowerCase();
        if (['submit', 'button', 'file', 'hidden'].includes(type)) return;

        const label = getLabel($wrapper, $input);
        result[fieldName] = {
          type,
          label,
          element: $input.get(0),
          filled: isFieldFilled($input, type),
        };
      } else {
        const addMoreBtn = $wrapper.find('.field-add-more-submit, input[type="submit"]').last().get(0);
        const fieldsArray = [];

        $wrapper.find('.draggable').each((idx, item) => {
          const $item = $(item);
          const subfieldsObj = {};

          const ordinal = (idx + 1) + (idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th');
          const parentLabelText = fieldName.replace('field-', '').replace(/-/g, ' ');

          $item.find('input, textarea, select, .ck-editor__editable_inline').each((_, subInput) => {
            const $subInput = $(subInput);
            const type = $subInput.attr('type') || subInput.tagName.toLowerCase();
            if (!$subInput.is(':visible') || ['submit', 'button', 'file', 'hidden'].includes(type)) return;

            const baseLabel = getLabel($wrapper, $subInput, true, idx).trim();
            let label = '';

            if (baseLabel) {
              label = `${baseLabel} of ${ordinal} (${parentLabelText})`;
            } else {
              label = `${ordinal} ${parentLabelText}`;
            }

            let key = $subInput.attr('name') || label.toLowerCase().replace(/\s+/g, '_');
            subfieldsObj[key] = {
              type,
              label,
              element: subInput,
              filled: isFieldFilled($subInput, type),
            };
          });

          fieldsArray.push(subfieldsObj);
        });

        result[fieldName] = {
          fields: fieldsArray,
          addmore: addMoreBtn,
        };
      }
    });

    return result;
  }



  /* -----------------------
     AI / question helpers
     ----------------------- */

  function askQuestion(label, mode, userInput = '', cb) {
    const contentType = drupalSettings.voice_assist.contentType || '';
    const payload = { label, mode, contentType };
    if (mode === 'interpret') payload.value = userInput;
    fetch(Drupal.url('voice-assist/ai'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => res.json()).then(data => cb(data.response)).catch(() => cb(''));
  }


  /* -----------------------
      Main Processing Logic
      ----------------------- */

  function processFields(fields, keys = Object.keys(fields), i = 0) {
    if (i >= keys.length) {
      // All done, ask for submit
      speak("All done. Should I submit this?", () => {
        listen(val => {
          if (['yes', 'submit', 'done', 'save'].some(v => val.toLowerCase().includes(v))) {
            const $submit = $('#edit-gin-sticky-actions input[type="submit"]:visible, #edit-actions input[type="submit"]:visible').first();
            if ($submit.length) {
              $submit.trigger('click');
              speak("Form submitted.");
            } else {
              speak("Submit button not found.");
            }
          } else {
            speak("Submission cancelled.");
          }
        });
      });
      return;
    }

    const key = keys[i];
    const fld = fields[key];

    if (!fld.fields) {
      if (fld.filled) {
        processFields(fields, keys, i + 1);
        return;
      }
      // Single field
      fillFieldValue(fld, () => {
        processFields(fields, keys, i + 1);
      });
    } else {
      let anyFilled = false;
      let j = 0;

      function processSubfieldGroup() {
        if (j >= fld.fields.length) {
          if (fld.addmore && anyFilled) {
            const addBtn = $(fld.addmore);
            speak(`Do you want to ${fld.addmore.value || "add more"}?`, () => {
              listen(val => {
                if (['yes', 'sure', 'add', 'yep'].some(v => val.toLowerCase().includes(v))) {
                  const prevCount = Object.keys(fields).length;
                  if (addBtn.hasClass('sam-add-more-button')) {
                    addBtn.trigger('click');
                  } else {
                    addBtn.trigger('mousedown').trigger('mouseup');
                  }
                  waitForNewFields(prevCount, () => {
                    fields = getVisibleFields();
                    processFields(fields);
                  });
                } else {
                  processFields(fields, keys, i + 1);
                }
              });
            });
          } else {
            processFields(fields, keys, i + 1);
          }
          return;
        }

        const subFldGroup = fld.fields[j];
        const subKeys = Object.keys(subFldGroup);
        let k = 0;

        function processSingleSubField() {
          if (k >= subKeys.length) {
            j++;
            processSubfieldGroup();
            return;
          }

          const subFld = subFldGroup[subKeys[k]];
          if (subFld.filled) {
            k++;
            processSingleSubField();
            return;
          }

          fillFieldValue(subFld, () => {
            anyFilled = true;
            k++;
            processSingleSubField();
          });
        }

        processSingleSubField();
      }

      processSubfieldGroup();
    }
  }


  /* -----------------------
 Start/stop and Drupal behavior
 ----------------------- */


  function start() {
    if (isRunning) return;
    isRunning = true;
    fields = getVisibleFields();
    processFields(fields);
    $("#voice-assist-status").text("Voice Assist Running");
    $("#voice-assist-toggle").hide();
    $("#voice-assist-stop").show();
  }

  function stop() {
    isRunning = false;
    recog?.abort();
    recog = null;
    synth.cancel();
    $("#voice-assist-status").text("Voice Assist Stopped");
    $("#voice-assist-toggle").show();
    $("#voice-assist-stop").hide();
  }

  Drupal.behaviors.voiceAssist = {
    attach(context) {
      if (!once("voice-assist-init", "body", context).length) return;

      $("<div>").attr("id", "voice-assist-status").css({ margin: "10px 0", fontWeight: "bold" }).prependTo("form.node-form");

      $("<button>").attr("id", "voice-assist-toggle").addClass("button").text("🟢 Start Voice Assist")
        .prependTo("form.node-form").on("click", e => { e.preventDefault(); start(); });

      $("<button>").attr("id", "voice-assist-stop").addClass("button").text("🛑 Stop Voice Assist")
        .css("display", "none").prependTo("form.node-form").on("click", e => { e.preventDefault(); stop(); });
    }
  };
})(jQuery, Drupal, drupalSettings);
