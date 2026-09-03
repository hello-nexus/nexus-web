// React's InputHTMLAttributes omits `webkitdirectory`, the folder-picker
// switch on <input type="file"> that every shipping browser honours.
import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
