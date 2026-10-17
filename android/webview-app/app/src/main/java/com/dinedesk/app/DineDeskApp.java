package com.dinedesk.app;

import android.app.Application;

/** App start: notification channels, and Firebase (app notifications) when the build has it. */
public class DineDeskApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Push.init(this);
    }
}
