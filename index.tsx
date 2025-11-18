import '@angular/compiler';
import { bootstrapApplication, provideProtractorTestingSupport } from '@angular/platform-browser';
import { AppComponent } from './src/app.component';
import { provideZonelessChangeDetection, importProvidersFrom } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeHr from '@angular/common/locales/hr';
import { provideHttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

registerLocaleData(localeHr);

bootstrapApplication(AppComponent, {
  providers: [
    provideProtractorTestingSupport(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    importProvidersFrom(FormsModule),
  ],
}).catch((err) => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.