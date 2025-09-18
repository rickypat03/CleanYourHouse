import { Routes } from '@angular/router';

export const routes: Routes = [

    {path: 'login', loadChildren: () => import('./login/login.module').then(m => m.LoginModule) },
    //TODO imposta il login come landing page{path: '', redirectTo: 'login', pathMatch: 'full' }
    {path: 'create-house-map', loadChildren: () => import('./canva/canva.module').then(m => m.CanvaModule) },
    {path:'', redirectTo: 'create-house-map', pathMatch: 'full' },
];
