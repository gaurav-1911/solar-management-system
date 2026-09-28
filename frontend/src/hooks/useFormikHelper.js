import { useFormik } from "formik";

/**
 * Enhanced useFormikHelper Hook.
 * Wraps useFormik and provides clean helpers for Formik & Yup validation.
 *
 * @param {Object} options Configuration options
 * @param {Object} options.initialValues Initial form values object
 * @param {Object} options.validationSchema Yup validation schema
 * @param {Function} options.onSubmit Submit handler callback (values, helpers)
 * @param {boolean} options.enableReinitialize Enable reinitialization on initialValues change
 */
export const useFormikHelper = ({
  initialValues = {},
  validationSchema,
  onSubmit,
  enableReinitialize = true,
  ...formikOptions
}) => {
  const formik = useFormik({
    initialValues,
    validationSchema,
    onSubmit,
    enableReinitialize,
    ...formikOptions,
  });

  const getFieldError = (name) => {
    const error = formik.errors[name];
    const touched = formik.touched[name];
    return touched && error ? error : null;
  };

  const isInvalid = (name) => {
    return Boolean(formik.touched[name] && formik.errors[name]);
  };

  const getFieldProps = (name) => {
    return {
      name,
      value: formik.values[name] ?? "",
      onChange: formik.handleChange,
      onBlur: formik.handleBlur,
      error: formik.errors[name],
      touched: formik.touched[name],
    };
  };

  return {
    ...formik,
    formik,
    getFieldError,
    isInvalid,
    getFieldProps,
  };
};

export default useFormikHelper;
