package com.dinedesk.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase Cloud Messaging: a new token for this phone, and messages that arrive while the app is
 * open (when it is closed Android shows them itself, on the channel the server names). Only enabled
 * in builds with Firebase (manifest placeholder fcmEnabled).
 */
public class PushService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        Push.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        RemoteMessage.Notification n = message.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : data.get("title");
        String body = n != null && n.getBody() != null ? n.getBody() : data.get("body");
        String channel = n != null && n.getChannelId() != null ? n.getChannelId() : data.get("channel");
        String tag = n != null ? n.getTag() : null;
        if ((title == null || title.isEmpty()) && (body == null || body.isEmpty())) return;
        Push.show(this, title, body, data.get("url"), channel, tag);
    }
}
