Put reference pictures here (png, jpg, webp). Name them after what they show, so the agent can find them:

    oldcity.png   mainmenu.png   shop_interior.png   mountains_01.png   mountains_02.png

The agent lists them with the command reference_images, then looks at the ones that match its task (by exact name or by a word such as "city"). Several pictures of one subject are better than one. Subfolders are fine (for example REFERENCES/ui/mainmenu.png). Keep each picture under about 1 MB; bigger ones are shrunk when Pillow is installed, otherwise skipped.
