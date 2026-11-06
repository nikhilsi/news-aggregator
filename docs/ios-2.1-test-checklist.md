# iOS 2.1: device test checklist

**For:** Nikhil's iPhone walk of the TestFlight build (#425), Nov 2026.  
**Build:** 2.1 (3) or later. Settings, About ClearNews shows the version and build.  
**Already checked in the simulator against production** (Nov 5): Today, "Covered by N outlets", the footer, the reader (captions, a table, a long author line, blocked and video pages, a coverage link), About, another tab, dark mode and the largest text size. This list is what needs a real phone.

Note anything off with a screenshot (TestFlight's own screenshot feedback works) or tell Claude.

## Today (the first tab)

- [ ] The header shows today's date, the story count and "updated N min ago", matching the Today page on getclearnews.com.
- [ ] Scrolled, about 5 to 6 stories fit on a screen: number, headline, source, time, a small photo.
- [ ] "Covered by N outlets" opens to each outlet's headline; tapping one opens that outlet's article in the reader.
- [ ] A US politics story shows the Fox and NPR marks.
- [ ] The bottom says "You're all caught up." and when the next edition is due.
- [ ] Pull to refresh: the list stays on screen, the spinner turns, no error.
- [ ] Leave the app for more than an hour, come back: Today reloads, and "updated" shows the new edition's age.
- [ ] Search from Today shows cards; clearing the search brings Today back.

## Other tabs

- [ ] Cards as in 2.0, with infinite scroll; Latest has everything.

## Reader

- [ ] The photo above the title appears without pushing the text down.
- [ ] A long author list wraps under the title instead of squeezing into columns.
- [ ] Photo captions read smaller and gray, set apart from the story.
- [ ] A wide table (Ars Technica reviews often have one) scrolls sideways inside the page.
- [ ] Pinch to zoom works; while zoomed, you can move around; zooming back out returns to normal scrolling.
- [ ] Links open in Safari; Back closes the reader.
- [ ] A video page (Polygon has some) says "This is a video, not an article." with "Watch on Polygon".
- [ ] The font size setting (Settings, Reader, S to XL) applies.

## Settings and the rest

- [ ] About shows 2.1 and no longer mentions financial news APIs; Privacy Policy and Support open.
- [ ] Dark mode, light mode and System all look right in Today and the reader.
- [ ] VoiceOver: each Today row reads as one button (headline, source, time); the outlets control says expanded or collapsed.
- [ ] Largest text size (iPhone Settings, Accessibility, Display & Text Size, Larger Text): nothing clipped or cut off at the right edge.
- [ ] Turned sideways (landscape): Today and the reader still read well.
- [ ] Airplane mode: an error with Retry; turning it off and tapping Retry loads.

## Not in this build

Topic sections and "new since your last visit" (the Should items), the widget and reminders, and notifications (#435). The App Store release waits for notifications (Nikhil, Nov 5).
