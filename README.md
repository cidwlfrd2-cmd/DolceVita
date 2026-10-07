# DolceVita Order Bot

A Discord bot for submitting orders, showing a public queue, and letting staff claim and close orders.

## Setup

1. Install Node.js 20 or newer, then run `npm install`.
2. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enable the `bot` and `applications.commands` scopes in its server install link. Enable the privileged **Message Content Intent** in the bot settings to use the `,calc` message command. The bot needs permission to view and send messages, embed links, manage channels and roles for private tickets, and use application commands.
3. Copy `.env.example` to `.env`, then fill in the bot token and application client ID. Commands are registered globally on startup. Set `DISCORD_GUILD_ID` to register them only in one development server and remove any global registrations, avoiding duplicate commands there. Remove `DISCORD_GUILD_ID` to register commands globally.
4. Run `npm run deploy`, invite the bot to your server, and start it with `npm start`.
5. An administrator runs `/setup channel:#orders`. Optionally choose a staff role; without one, staff actions require the Discord `Manage Messages` permission.

## Commands

- `/order items:<items> payment_method:<method> supporter:<staff member> quantity:<optional>` is staff-only. Its Components V2 container shows the source channel, items with quantity, payment method, status, and the assigned supporter, with **processing**, **done**, and **cancelled** buttons inside the container. When submitted inside an order ticket, the ticket form's quantity is used. The customer is the ticket owner when `/order` is run inside a ticket; otherwise it is the staff member who submitted the order. New orders show **noted** until updated.
- Orders remain active for 48 hours after submission. Orders that are still pending or claimed at the end of that period expire and can no longer be processed, completed, or cancelled.
- When an order is marked **Processing**, **Complete**, or **Cancelled**, the bot sends a status-update embed both to the channel where `/order` was run and by DM to the order submitter.
- When an order is marked **Complete**, the bot also sends the warranty-policy reminder embed to the original order channel and the customer by DM. The DM's Vouch form uses the order quantity and includes it beside the item.
- The role configured with `/set voided_role` is assigned to the order customer when an order is completed. It is removed if they submit a vouch within 12 hours, and their order ticket is notified. If they do not vouch within 12 hours, the warranty-void notice is posted in the channel configured with `/voidedchannel`, showing the item and ticket quantity, and the order ticket is automatically closed with the transcript reason `Voided No Vouch`.
- `/queue` publicly displays active waiting and claimed orders.
- `/claim` lets authorized staff claim the oldest waiting order.
- `/payment` lets authorized staff send the payment reminder in an active ticket.
- `/solving amount_one:<number> amount_two:<number>` multiplies two numbers and displays the result.
- `,calc <number>*<number>` (for example, `,calc 5*5`) sends the result as `5 x 5 = 25` in a Discord Components V2 container, then deletes the command message. The bot needs the **Manage Messages** permission in that channel. The `/solving` slash command remains available.
- `/message text:<message> channel:<optional>` lets authorized staff post a message as the bot in the current or selected text channel. Mentions are not triggered.
- `/openshop` posts the shop-open announcement as a Discord Components V2 container in the current channel.
- `/closeshop` posts the shop-closed announcement as a Discord Components V2 container in the current channel, with red “closed” text and blue bold section headings.
- `/dmsuser user:@user reply:<message>` lets authorized staff DM a user in a Discord Components V2 container. Mentions in the reply do not trigger notifications.
- `/set vouch channel:#vouches` lets an administrator choose where vouches are posted.
- `/set voided_role role:<role>` configures the role assigned to the order customer when an order is completed. A vouch submitted within 12 hours removes the role and posts a notice in the order ticket.
- `/voidedchannel channel:#channel` configures where the warranty-void notice is sent after 12 hours without a vouch.
- `/set ticket_transcript channel:#transcripts` lets an administrator choose where closed ticket transcripts are posted. Closing a ticket posts a summary embed and attaches the complete conversation and attachment links as a text file; the ticket owner also receives the same transcript by DM when their DMs are available.
- `/setupticketcategory category_id:<category id>` sets the fallback category for new ticket channels.
- `/help` posts an embed with slash commands and the remaining `,calc` message command.
- `/vouch items:<items> feedback:<feedback> proof:<image> proof2:<optional image>` first shows the submitter a private preview with the warranty terms, buyer, item, vouch date, feedback, and proof collage. Confirming posts one embed publicly and records the vouch; if the ticket owner submitted it from their ticket, they also receive the vouch embed and proof collage by DM. Choosing **No, I'll change it** cancels the preview so they can rerun `/vouch` with changes. One or two proof images are combined into a single collage that preserves their proportions.
- `/checkvouch user:<optional>` displays a user's total vouches and their vouch dates/items. Omit the user to check your own history.
- `/giveaway start prize:<prize> host:<user> duration:<duration> winners:<count>` starts a V2 giveaway container with a 🎉 join button in the current channel. Durations use `s`, `m`, `h`, or `d` (for example `30m` or `2d`). Optional `message_count` and `message_channel` require that many messages the bot has tracked since this feature was enabled; `messagerequirements` adds displayed instructions; `override_req_roles` accepts up to 10 comma-separated role mentions or IDs and limits joining to members with one of those roles. The configured `/setadmin` and `/setowner` roles can manage giveaways.
- `/giveaway end message_id:<id>` ends a giveaway and randomly selects the configured number of winners. Giveaways end automatically at their duration, including after a bot restart.
- `/giveaway reroll message_id:<id>` selects replacement winners from eligible entrants, excluding previous winners.
- `/giveaway ban user:<user>` prevents a user from joining any server giveaway; `/giveaway banned` lists all giveaway bans. Bans are server-specific.
- `/stickymessage set text:<message> channel:<optional>` keeps a message at the bottom of the chosen channel by reposting it after each new message. `/stickymessage remove channel:<optional>` clears it. Both actions require staff access.
- `/ticketsetup staff_role:<optional>` posts a panel in the current channel with **order**, **report**, and **others** buttons. Order opens an **ORDER FORM** for product, quantity, and payment method; report opens a **REPORT FORM** for the purchased product, issue, and rules confirmation; others asks the user to enter exactly **PARTNERSHIP** or **CONCERN** (case-insensitive) before creating a ticket. Each form creates its private ticket only after valid submission, and the answers appear in the ticket embed. Form tickets are named by button type, submitted product, and username (for example, `order-latte-alex`, `report-latte-alex`, or `others-partnership-concern-alex`). Discord channel names use the username rather than a real `@mention`. The configured `/setadmin` and `/setowner` roles can claim and close tickets, including tickets created by their members; the optional ticket staff role can view tickets but cannot claim or close them. After a claim, only the claimant (and ticket creator) can send messages, while other ticket-access roles can still view the ticket. Only the claimant can unclaim, which lets another authorized staff member take over. Closing a ticket requires confirmation and a reason, which is included in its transcript before the channel is deleted.
- `/setowner role:<role>` can only be run by the server owner. The selected role and server owner can use **Processing**, **Complete**, and **Cancel** buttons. The selected role can also claim and close tickets, including tickets created by its members. Closed orders leave the active queue.
- `/setadmin role:<role>` can be run by a server administrator and grants the selected role access to `/order`, `/claim`, and ticket claim/close actions, including closing tickets created by its members.
- `/setorder channel:#orders` can be run by a server administrator to choose where new order embeds are posted. Each order also shows the channel where `/order` was submitted.
- `/setup channel:<channel> staff_role:<optional>` changes the public order channel and staff role.

Order and server setup data are stored in `data/orders.json` on disk. Back up that file to preserve the queue between deployments.

Run `npm test` for the order-store checks.
