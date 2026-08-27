# Screen recording script — App Review, submission ceda5a4d

One take, physical iPhone, **build 1.0 (16)**. Target 90–120 seconds. No narration needed;
Apple reads the written reply alongside it.

## Before you hit record

1. **Delete the app from the device.** The Terms of Use gate only appears on a first launch
   (or after `TERMS_VERSION` is bumped), so a reinstall is the only way to film it. This is
   the single most common way this recording gets ruined.
2. Reinstall **1.0 (16)** from TestFlight. Do **not** open it yet.
3. Confirm the ladder has rows to work with — steps 6–8 need at least one other player on
   the board. There were 38 as of 27 Aug, so this should be fine, but a recording that
   reaches an empty ladder cannot demonstrate flag or block.
4. Optional but valuable: sign the device into a **Sandbox Apple ID**
   (Settings → App Store → Sandbox Account) so step 10 can complete a real purchase.
5. Control Centre → **Screen Recording**. Audio is not required.

## The take

| # | Beat | What to hold on |
|---|---|---|
| 1 | Launch from the home screen | The **Terms of Use** screen is the first thing shown. Rest 2–3s on the first clause: *"There is zero tolerance for objectionable content and abusive users."* |
| 2 | Scroll the terms briefly, then tap **I agree** | Shows it is a real agreement, not a splash |
| 3 | On character creation, tap the **quill** icon | The name field becomes editable |
| 4 | Type **`Nazi`** | The rejection message appears and **Begin Your Legend** greys out. Hold 2s. |
| 5 | Clear it, type a normal name (e.g. `Thoradin`) | The rejection clears and the button re-enables |
| 6 | Tap **Begin Your Legend** | The world loads |
| 7 | **MENU** → **LADDER** | The board with other players' names |
| 8 | Tap the **⚑** on another player's row | The report dialog: five reasons, **Block and report**, **Report only** |
| 9 | Tap **Report only** → show the confirmation → close | Confirms the flag mechanism works |
| 10 | Tap **⚑** on the **same player** again → **Block and report** | **THE KEY BEAT.** Show the confirmation, close it, and hold on the list while that row is gone. This is the one thing that proves "removes it from the user's feed instantly" — 3s here is worth 30s anywhere else. |
| 11 | Close the ladder → **☰** → **Shop** | Founder Pack and Standing Orders, each with a **live price**, plus **Restore Purchases** |
| 12 | Back → **MENU → Looks** | The Founder Pack section showing a price rather than "Store unavailable" — this is the exact screen that failed review |
| 13 | *(only if signed into Sandbox)* Tap the purchase button | The Apple payment sheet. Completing it is the strongest possible evidence for 2.1(b); reaching the sheet is nearly as good. Stop there if unsure. |

Stop recording.

## Two things to know before you film

**Blocking is permanent from the app's side.** There is no in-app unblock — `unblockPlayer`
exists in the code but nothing calls it. Whoever you block in step 10 stays hidden from
your board and your world. To undo it afterwards, in the Supabase SQL editor:

```sql
delete from public.user_blocks where blocker_id = auth.uid();
```

(or delete the specific `blocked_id` row). Also clear the two reports step 9 and 10 file,
so your own test traffic does not sit in the moderation queue:

```sql
delete from public.content_reports where reporter_id = '<your user_id>';
```

**Why `Nazi` rather than a slur** in step 4: it trips the same filter list and is
unambiguously objectionable to a reviewer, without putting a racial slur on a recording
that goes into Apple's records. Any of the hate or sexual terms work identically if you
would rather use something else.

## After

Attach the recording to the Resolution Center reply (text in
`store/REVIEW-REPLY-SHORT.txt`, 3,924 chars), **then** click **Resubmit to App Review**.

Apple also asked for these steps in **App Review Information → Notes** for future
submissions — they are already there, in the notes set on 26 Aug.
