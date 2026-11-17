import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
KEY, PKG, AAB, MODE = sys.argv[1], "com.stillmarch.game", sys.argv[2], sys.argv[3]
creds = service_account.Credentials.from_service_account_file(KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"])
svc = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
edits = svc.edits()
eid = edits.insert(packageName=PKG, body={}).execute()["id"]
print("edit opened")
tracks = edits.tracks().list(packageName=PKG, editId=eid).execute().get("tracks", [])
for t in tracks:
    print("track", t["track"], [(r.get("status"), r.get("versionCodes"), r.get("name")) for r in t.get("releases", [])])
if MODE == "check":
    edits.delete(packageName=PKG, editId=eid).execute(); print("check only, edit discarded"); sys.exit()
media = MediaFileUpload(AAB, mimetype="application/octet-stream", resumable=True)
b = edits.bundles().upload(packageName=PKG, editId=eid, media_body=media).execute()
print("uploaded bundle versionCode", b["versionCode"])
edits.tracks().update(packageName=PKG, editId=eid, track="production", body={
  "track": "production",
  "releases": [{"name": "1.5.1", "versionCodes": [str(b["versionCode"])], "status": "draft",
    "releaseNotes": [{"language": "en-US", "text": "Founder Pack and Standing Orders can now be bought on Android. Both are optional one-time purchases."}]}]
}).execute()
r = edits.commit(packageName=PKG, editId=eid).execute()
print("committed edit; production release 1.5.1 saved as DRAFT")
