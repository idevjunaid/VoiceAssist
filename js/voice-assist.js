(function ($, Drupal, drupalSettings) {
  let recog, isRunning = false, fields = [], index = 0;
  const synth = window.speechSynthesis;
  const processedRepeatables = new Set();

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

  function checkSkip(val) {
    return ['skip', 'leave it', 'ignore', 'no', 'move on', 'next'].some(k => val.toLowerCase().includes(k));
  }

  function getVisibleFields() {
    const result = [];
    $('form.node-form').find('input, textarea, select, .ck-editor__editable_inline').each(function () {
      const $el = $(this);
      if (!$el.is(":visible")) return;

      const wrapper = $el.closest(".form-item, .js-form-item, .form-wrapper");
      const label = wrapper.find("label").first().text().trim() || $el.attr("placeholder") || $el.attr("name") || $el.attr("id");
      if (!label || ['submit', 'button', 'file', 'hidden'].includes($el.attr("type"))) return;
      if (['Text format', 'Revision log message', 'Published'].some(l => label.includes(l))) return;

      const type = $el.attr("type") || $el.prop("tagName").toLowerCase();
      if ($el.hasClass("ck-editor__editable_inline") || $el.attr("contenteditable") === "true") {
        const $textarea = $el.closest(".form-textarea-wrapper").find("textarea[data-ckeditor5-id]");
        if ($textarea.length) result.push({ type: "ckeditor5", label, $el: $textarea, $editorDiv: $el });
      } else if (type === 'select') {
        result.push({ type: 'select', label, $el });
      } else if (type === 'checkbox') {
        result.push({ type: 'checkbox', label, $el });
      } else {
        result.push({ type: 'text', label, $el });
      }
    });

    return result;
  }

  function askQuestion(label, mode, userInput = '', cb) {
    const payload = { label, mode };
    if (mode === 'interpret') payload.value = userInput;
    fetch(Drupal.url('voice-assist/ai'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(res => res.json()).then(data => cb(data.response)).catch(() => cb(''));
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

  function processFields(i = 0) {
    if (!isRunning) return;
    index = i;

    if (i >= fields.length) {
      speak("All done. Should I submit this?", () => {
        listen(val => {
          if (['yes', 'submit', 'done', 'save'].some(v => val.toLowerCase().includes(v))) {
            const $submit = $('#edit-gin-sticky-actions input[type="submit"]:visible, #edit-actions input[type="submit"]:visible').first();
            console.log($submit,'submit')
            $submit.trigger('click');
          }
        });
      });
      return;
    }

    const field = fields[i];
    const $wrapper = field.$el.closest('.field--type-entity-reference-revisions, .form-item--multiple');
    console.log($wrapper, "wrapper")
    const isRepeatable = $wrapper.length;
    console.log("wrapper length", isRepeatable)
    const wrapperKey = $wrapper.attr('id') || $wrapper.data('drupal-selector') || $wrapper.prop('outerHTML');
    console.log("wrapper key", wrapperKey)
    console.log(isRepeatable && !processedRepeatables.has(wrapperKey));
    if (isRepeatable && !processedRepeatables.has(wrapperKey)) {
      const askAddMore = () => {
        const addBtn = $wrapper.find('.field-add-more-submit, .sam-add-more-button').first();
        console.log("add button", addBtn);
        speak(`Do you want to ${addBtn.val() || "add more"}?`, () => {
          listen(val => {
            if (checkSkip(val) || val.toLowerCase().includes("no")) {
              processedRepeatables.add(wrapperKey);
              processFields(i);
              return;
            }
            if (val.toLowerCase().includes("yes")) {
              const prevCount = getVisibleFields().length;
              addBtn.trigger('mousedown').trigger('mouseup');
              waitForNewFields(prevCount, () => {
                fields = getVisibleFields();
                processFields(i);
              });
            } else {
              processedRepeatables.add(wrapperKey);
              processFields(i);
            }
          });
        });
      };

      askAddMore();
      return;
    }

    // Normal field processing
    askQuestion(field.label, 'question', '', question => {
      speak(question, () => {
        listen(val => {
          if (checkSkip(val)) return processFields(i + 1);
          askQuestion(field.label, 'interpret', val, interpreted => {
            const finalVal = interpreted?.value || interpreted || val;

            if (field.type === 'ckeditor5') {
              const ed = field.$editorDiv?.get(0);
              const inst = ed?.ckeditorInstance || $(ed).data("ckeditorInstance");
              if (inst?.setData) inst.setData(finalVal);
              else $(ed).html(finalVal).trigger("input").trigger("change");
            } else if (field.type === 'select') {
              field.$el.find('option').each(function () {
                if (finalVal.toLowerCase().includes($(this).text().toLowerCase())) {
                  $(this).prop('selected', true).trigger('change');
                }
              });
            } else if (field.type === 'checkbox') {
              field.$el.prop('checked', ['yes', 'true'].includes(finalVal.toLowerCase()));
            } else {
              field.$el.val(finalVal).trigger('input').trigger('change');
            }

            processFields(i + 1);
          });
        });
      });
    });
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    fields = getVisibleFields();
    index = 0;
    processFields();
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
