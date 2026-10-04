# DolceVita Order Bot

A Discord bot for submitting orders, showing a public queue, and letting staff claim and close orders.

## Setup

1. Install Node.js 20 or newer, then run `npm install`.
2. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enable the `bot` and `applications.commands` scopes in its server install link. Enable the privileged **Message Content Intent** in the bot settings to use message-command shortcuts. The bot needs permission to view and send messages, embed links, manage channels and roles for private tickets, and use application commands.
3. Copy `.env.example` to `.env`, then fill in the bot token and application client ID. Commands are registered globally on startup. Set `DISCORD_GUILD_ID` to also register them immediately in one development server while global registration propagates.
4. Run `npm run deploy`, invite the bot to your server, and start it with `npm start`.
5. An administrator runs `/setup channel:#orders`. Optionally choose a staff role; without one, staff actions require the Discord `Manage Messages` permission.

## Commands

- `/order items:<items> payment_method:<method> supporter:<staff member> quantity:<optional>` is staff-only. Its compact embed shows who placed the order, quantity and items, payment method, status, and the assigned supporter. The customer is the ticket owner when `/order` is run inside a ticket; otherwise it is the staff member who submitted the order. New orders show **noted** until updated, and the buttons read **processing**, **done**, and **cancelled**.
- Orders remain active for 48 hours after submission. Orders that are still pending or claimed at the end of that period expire and can no longer be processed, completed, or cancelled.
- When an order is marked **Processing**, **Complete**, or **Cancelled**, the bot sends a status-update embed both to the channel where `/order` was run and by DM to the order submitter.
- When an order is marked **Complete**, the bot also sends the warranty-policy reminder embed to the original order channel and the customer by DM.
- `/queue` publicly displays active waiting and claimed orders.
- `/claim` lets authorized staff claim the oldest waiting order.
- `/solving amount_one:<number> amount_two:<number>` multiplies two numbers and displays the result.
- `,payment` is available only to the creator of an active ticket, where it posts the Dolce Vita payment reminder embed with the server icon thumbnail, when one is set. Only that ticket creator can use its buttons. **yes** privately sends a GCash payment-details embed with the supplied QR image; **no** asks for confirmation before closing the ticket. Closing by **no** requires the transcript channel to be configured.
- `,calc <number>*<number>` (for example, `,calc 5*5`) sends the result as `5 x 5 = 25` in a title-less embed, then deletes the command message. The bot needs the **Manage Messages** permission in that channel. The `/solving` slash command remains available.
- `/message text:<message> channel:<optional>` lets authorized staff post a message as the bot in the current or selected text channel. Mentions are not triggered.
- `/set vouch channel:#vouches` lets an administrator choose where vouches are posted.
- `/set ticket_transcript channel:#transcripts` or `,set ticket_transcript <channel id>` lets an administrator choose where closed ticket transcripts are posted. Closing a ticket posts a summary embed and attaches the complete conversation and attachment links as a text file; the ticket owner also receives the same transcript by DM when their DMs are available.
- `/setupticketcategory category_id:<category id>` or `,setupticketcategory <category id>` sets the fallback category for new ticket channels. `/ordercategory category_id:<category id>` or `,ordercategory <category_id>` sets the category for order tickets; `/reportcategory category_id:<category id>` or `,reportcategory <category_id>` sets the category for report tickets; `/othercategory category_id:<category id>` or `,othercategory <category_id>` sets the category for other tickets. These per-type category settings override the fallback and all commands are administrator-only.
- `/help` or `,help` posts an embed with slash commands and message shortcuts in separate sections.
- `/vouch items:<items> feedback:<feedback> proof:<image> proof2:<optional image>` first shows the submitter a private preview with the warranty terms, buyer, item, vouch date, feedback, and proof collage. Confirming posts one embed publicly and records the vouch; if the ticket owner submitted it from their ticket, they also receive the vouch embed and proof collage by DM. Choosing **No, I'll change it** cancels the preview so they can rerun `/vouch` with changes. One or two proof images are combined into a single collage that preserves their proportions.
- `/checkvouch user:<optional>` displays a user's total vouches and their vouch dates/items. Omit the user to check your own history.
- `/stickymessage set text:<message> channel:<optional>` keeps a message at the bottom of the chosen channel by reposting it after each new message. `/stickymessage remove channel:<optional>` clears it. Both actions require staff access.
- `/ticket setup staff_role:<optional>` posts a panel in the current channel with **order**, **report**, and **others** buttons. Order opens an **ORDER FORM** for product, quantity, and payment method; report opens a **REPORT FORM** for the purchased product, issue, and rules confirmation; others asks the user to enter exactly **PARTNERSHIP** or **CONCERN** (case-insensitive) before creating a ticket. Each form creates its private ticket only after valid submission, and the answers appear in the ticket embed. Form tickets are named by button type, submitted product, and username (for example, `order-latte-alex`, `report-latte-alex`, or `others-partnership-concern-alex`). Discord channel names use the username rather than a real `@mention`. The configured `/setadmin` and `/setowner` roles can claim and close tickets, including tickets created by their members; the optional ticket staff role can view tickets but cannot claim or close them. After a claim, only the claimant (and ticket creator) can send messages, while other ticket-access roles can still view the ticket. Only the claimant can unclaim, which lets another authorized staff member take over. Closing a ticket requires confirmation and a reason, which is included in its transcript before the channel is deleted.
- `/ticketsetup` or `,ticketsetup` immediately posts the same three-button ticket panel in the current channel. Both shortcuts are administrator-only.
- `/setowner role:<role>` can only be run by the server owner. The selected role and server owner can use **Processing**, **Complete**, and **Cancel** buttons. The selected role can also claim and close tickets, including tickets created by its members. Closed orders leave the active queue.
- `/setadmin role:<role>` can be run by a server administrator and grants the selected role access to `/order`, `/claim`, and ticket claim/close actions, including closing tickets created by its members.
- `/setorder channel:#orders` can be run by a server administrator to choose where new order embeds are posted. Each order also shows the channel where `/order` was submitted.
- `/setup channel:<channel> staff_role:<optional>` changes the public order channel and staff role.

Order and server setup data are stored in `data/orders.json` on disk. Back up that file to preserve the queue between deployments.

Run `npm test` for the order-store checks.
