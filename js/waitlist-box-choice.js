(function () {
  const storageKey = 'hhnSelectedBox';
  const params = new URLSearchParams(window.location.search);
  const boxFromUrl = params.get('box');

  function saveBoxChoice(boxChoice) {
    try {
      window.sessionStorage.setItem(storageKey, boxChoice);
    } catch (error) {
      return;
    }
  }

  function loadBoxChoice() {
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch (error) {
      return '';
    }
  }

  if (boxFromUrl) {
    saveBoxChoice(boxFromUrl);
  }

  function setBoxChoice(boxChoice) {
    if (!boxChoice) {
      return;
    }

    saveBoxChoice(boxChoice);
    applyBoxChoice(boxChoice);
  }

  function applyBoxChoice(boxChoice) {
    document.querySelectorAll('[data-lead-form][data-lead-type="waitlist"]').forEach((form) => {
      const boxSelect = form.querySelector('[name="subject"]');

      if (!boxSelect) {
        return;
      }

      const matchingOption = Array.from(boxSelect.options).find((option) => option.value === boxChoice);

      if (matchingOption) {
        boxSelect.value = boxChoice;
      }
    });
  }

  document.querySelectorAll('[data-box-choice]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      setBoxChoice(trigger.dataset.boxChoice);
    });
  });

  applyBoxChoice(boxFromUrl || loadBoxChoice());
}());
