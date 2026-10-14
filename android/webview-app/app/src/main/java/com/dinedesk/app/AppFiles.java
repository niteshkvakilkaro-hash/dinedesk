package com.dinedesk.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.List;

/**
 * A tiny file provider (the project has no AndroidX): content://<app id>.files/<area>/<name>.
 *   camera  photos the camera app writes for an upload (cache, write access granted per photo)
 *   files   saved downloads on Android 7–9, opened in a viewer app
 * Not exported; other apps only get the single Uri they are granted.
 */
public class AppFiles extends ContentProvider {
    static final String CAMERA = "camera";
    static final String FILES = "files";

    static File root(Context c, String area) {
        if (CAMERA.equals(area)) return new File(c.getCacheDir(), "camera");
        if (FILES.equals(area)) return c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        return null;
    }

    static Uri uriFor(Context c, String area, File file) {
        return new Uri.Builder().scheme("content").authority(c.getPackageName() + ".files").appendPath(area).appendPath(file.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        List<String> seg = uri.getPathSegments();
        if (seg.size() != 2) throw new FileNotFoundException();
        File dir = root(getContext(), seg.get(0));
        if (dir == null) throw new FileNotFoundException();
        try {
            File f = new File(dir, seg.get(1)).getCanonicalFile();
            if (!f.getParentFile().equals(dir.getCanonicalFile())) throw new FileNotFoundException();
            return f;
        } catch (IOException e) {
            throw new FileNotFoundException();
        }
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        int m = ParcelFileDescriptor.parseMode(mode);
        // Writing is only for camera photos.
        if ((m & ParcelFileDescriptor.MODE_READ_ONLY) != m && !CAMERA.equals(uri.getPathSegments().get(0))) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(f, m);
    }

    @Override
    public String getType(Uri uri) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment().replace(' ', '_'));
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext == null ? "" : ext.toLowerCase());
        return mime != null ? mime : "application/octet-stream";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try {
            f = fileFor(uri);
        } catch (FileNotFoundException e) {
            return null;
        }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
