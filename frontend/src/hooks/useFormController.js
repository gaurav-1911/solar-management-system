import { useState, useCallback, useEffect } from "react";

const useFormController = (initialValues = {}, validationRules = {}) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = useCallback(
    (fieldName, value) => {
      const rule = validationRules[fieldName];
      if (!rule) return null;

      if (rule.required && (!value || value.toString().trim() === "")) {
        return rule.requiredMessage || `${fieldName} is required`;
      }
      if (rule.minLength && value.length < rule.minLength) {
        return `Minimum ${rule.minLength} characters required`;
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return `Maximum ${rule.maxLength} characters allowed`;
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return rule.patternMessage || `Invalid ${fieldName}`;
      }
      if (rule.custom && typeof rule.custom === "function") {
        return rule.custom(value, values);
      }
      return null;
    },
    [validationRules, values]
  );

  const validateAll = useCallback(() => {
    const newErrors = {};
    Object.keys(validationRules).forEach((field) => {
      const error = validate(field, values[field]);
      if (error) newErrors[field] = error;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validate, validationRules, values]);

  const handleChange = useCallback(
    (fieldName, value) => {
      setValues((prev) => ({ ...prev, [fieldName]: value }));
      if (touched[fieldName]) {
        const error = validate(fieldName, value);
        setErrors((prev) => {
          const next = { ...prev };
          if (error) next[fieldName] = error;
          else delete next[fieldName];
          return next;
        });
      }
    },
    [validate, touched]
  );

  const handleBlur = useCallback(
    (fieldName) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      const error = validate(fieldName, values[fieldName]);
      setErrors((prev) => {
        const next = { ...prev };
        if (error) next[fieldName] = error;
        else delete next[fieldName];
        return next;
      });
    },
    [validate, values]
  );

  const handleSubmit = useCallback(
    (onSubmit) => async (e) => {
      e.preventDefault();
      if (!validateAll()) return;
      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (err) {
        console.error("Form submission error:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [validateAll, values]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const setFieldValue = useCallback((fieldName, value) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    validate,
    validateAll,
    reset,
    setFieldValue,
    setValues,
    setErrors,
  };
};

export default useFormController;
