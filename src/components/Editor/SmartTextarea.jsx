import React, { forwardRef } from 'react';

const SmartTextarea = forwardRef(({ value, onChange, className, rows, placeholder, disabled }, ref) => (
  <textarea
    ref={ref}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={className}
    rows={rows}
    placeholder={placeholder}
    disabled={disabled}
    spellCheck={true}
    lang="hi"
  />
));

export default SmartTextarea;
