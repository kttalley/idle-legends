"""Create (or update) Stillmarch's two one-time products on Google Play.

Needs a Google Payments merchant account on the Play developer account (otherwise
Google answers "Precondition check failed"). Uses the service account in
~/.config/stillmarch/play-service-account.json, which has Play Console access.

  python3 -m venv /tmp/play && /tmp/play/bin/pip install google-api-python-client google-auth
  /tmp/play/bin/python tools/play/create_products.py ~/.config/stillmarch/play-service-account.json

Prices are set in USD and converted to every Play region by Google. The product ids
match iOS and RevenueCat exactly; RevenueCat already maps them to the founder and
standing_orders entitlements and to the default offering.
"""
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

KEY = sys.argv[1]
PKG = "com.stillmarch.game"
PRODUCTS = [
    ("com.stillmarch.game.founder", "Founder Pack",
     "Three exclusive colourways and the founder's mark. Cosmetic only.", 4, 990000000),
    ("com.stillmarch.game.standing_orders", "Standing Orders",
     "Your hero ranges 8 hours longer offline. One-time, permanent.", 2, 990000000),
]

creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"])
m = build("androidpublisher", "v3", credentials=creds, cache_discovery=False).monetization()

for pid, title, desc, units, nanos in PRODUCTS:
    conv = m.convertRegionPrices(packageName=PKG, body={
        "price": {"currencyCode": "USD", "units": str(units), "nanos": nanos}}).execute()
    version = conv["regionVersion"]["version"]
    configs = [{"regionCode": rc, "price": v["price"], "availability": "AVAILABLE"}
               for rc, v in conv["convertedRegionPrices"].items()]
    body = {
        "packageName": PKG, "productId": pid,
        "listings": [{"languageCode": "en-US", "title": title, "description": desc}],
        "purchaseOptions": [{
            "purchaseOptionId": "buy",
            "buyOption": {"legacyCompatible": True, "multiQuantityEnabled": False},
            "regionalPricingAndAvailabilityConfigs": configs,
        }],
    }
    m.onetimeproducts().patch(packageName=PKG, productId=pid, allowMissing=True,
                              regionsVersion_version=version,
                              updateMask="listings,purchaseOptions", body=body).execute()
    # New purchase options start inactive; activate so the product can be bought.
    m.onetimeproducts().purchaseOptions().batchUpdateStates(
        packageName=PKG, productId=pid,
        body={"requests": [{"activatePurchaseOptionRequest": {
            "packageName": PKG, "productId": pid, "purchaseOptionId": "buy"}}]}).execute()
    print(f"{pid}: {len(configs)} regions, active")
