import { Component } from '@angular/core';
import { NavbarComponent } from './bar/navbar/navbar.component';
import { FooterComponent } from './bar/footer/footer.component';

@Component({
  selector: 'app-root',
  imports: [
    NavbarComponent, 
    FooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'CleanYourHouse';
}
