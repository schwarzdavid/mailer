import { createRouter, createWebHistory } from 'vue-router'
import AuthLayout from "@/modules/auth/layouts/AuthLayout.vue";
import LoginView from "@/modules/auth/views/LoginView.vue";
import {RouteNames} from "@/router/RouteNames.ts";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
      {
          path: '/login',
          component: AuthLayout,
          children: [
              {
                  path: '',
                  component: LoginView,
                  name: RouteNames.LOGIN
              }
          ]
      }
  ],
})
