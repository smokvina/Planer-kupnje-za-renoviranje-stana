
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RenovationPlannerComponent } from './components/renovation-planner/renovation-planner.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RenovationPlannerComponent],
})
export class AppComponent {
  title = 'Planer kupnje za renoviranje stana';
}