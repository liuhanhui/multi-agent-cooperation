import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Give one form control the shared label, hint, and spacing treatment.
 * @param props - Label, optional hint/class name, and the control to render
 * @returns A reusable labelled field wrapper
 */
export function FormField({
  label,
  hint,
  className = "",
  children,
}: FormFieldProps) {
  return (
    <label className={`form-field${className ? ` ${className}` : ""}`}>
      <span className="form-field-label">{label}</span>
      {children}
      {hint ? <span className="form-field-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * Render a text input with the common Hub control class.
 * @param props - Native input attributes
 * @returns Styled input retaining native behavior
 */
export function TextControl({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`form-control${className ? ` ${className}` : ""}`}
    />
  );
}

/**
 * Render a multiline input with the common Hub control class.
 * @param props - Native textarea attributes
 * @returns Styled textarea retaining native behavior
 */
export function TextAreaControl({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`form-control${className ? ` ${className}` : ""}`}
    />
  );
}

/**
 * Render a select with the common Hub control class.
 * @param props - Native select attributes and option children
 * @returns Styled select retaining native behavior
 */
export function SelectControl({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`form-control${className ? ` ${className}` : ""}`}
    />
  );
}
