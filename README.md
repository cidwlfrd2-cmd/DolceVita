# Dolce Vita Order Bot

A Discord bot for submitting orders, showing a public queue, and letting staff claim and close orders.

## Setup

1. Install Node.js 20 or newer, then run `npm install`.
2. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enable the `bot` and `applications.commands` scopes in its server install link. Enable the privileged **Message Content Intent** in the bot settings to use the `,ticketsetup` and `,help` shortcuts. The bot needs permission to view and send messages, embed links, manage channels and roles for private tickets, and use application commands.
3. Copy `.env.example` to `.env`, then fill in the bot token and application client ID. Set `DISCORD_GUILD_ID` to register commands immediately in one server while testing; leave it blank for global registration.
4. Run `npm run deploy`, invite the bot to your server, and start it with `npm start`.
5. An administrator runs `/setup channel:#orders`. Optionally choose a staff role; without one, staff actions require the Discord `Manage Messages` permission.

## Commands

- `/order items:<items> payment_method:<method> supporter:<staff member> quantity:<optional>` is staff-only and posts the selected supporter as **Served by** in the order embed. New orders show **Noted** until the configured owner role presses **Processing**.
- `/queue` publicly displays active waiting and claimed orders.
- `/claim` lets authorized staff claim the oldest waiting order.
- `/message text:<message> channel:<optional>` lets authorized staff post a message as the bot in the current or selected text channel. Mentions are not triggered.
- `/set vouch channel:#vouches` lets an administrator choose where vouches are posted.
- `/set ticket_transcript channel:#transcripts` lets an administrator choose where closed ticket transcripts are posted. Closing a ticket posts a transcript embed with a recent conversation excerpt and attaches the complete messages and attachment links as a text file.
- `/help` or `,help` posts an embed listing the bot’s slash commands and message shortcuts.
- `/vouch items:<items> feedback:<feedback> proof:<image> proof2:<image> ...` posts one public embed showing the items, feedback, submitter's name, and a single collage containing up to five proof images.
- `/checkvouch user:<optional>` displays a user's total vouches and their vouch dates/items. Omit the user to check your own history.
- `/stickymessage set text:<message> channel:<optional>` keeps a message at the bottom of the chosen channel by reposting it after each new message. `/stickymessage remove channel:<optional>` clears it. Both actions require staff access.
- `/ticket setup staff_role:<optional>` posts a panel in the current channel with **order**, **report**, and **others** buttons. Order opens an **ORDER FORM** for product, quantity, and payment method; report opens a **REPORT FORM** for the purchased product, issue, and rules confirmation; others opens a **PARTNERSHIP / CONCERN** form with a required description. Each form creates its private ticket only after submission, and the answers appear in the ticket embed. Form tickets are named by button type, submitted product, and username (for example, `order-latte-alex`, `report-latte-alex`, or `others-partnership-concern-alex`). Discord channel names use the username rather than a real `@mention`. Members with the configured ticket staff or `/setowner` role can claim tickets; after claiming, only the claimant (and ticket creator) can send messages, while other ticket staff can still view the ticket. Those roles can close tickets, but ticket creators cannot close their own tickets.
- `/ticketsetup` or `,ticketsetup` immediately posts the same three-button ticket panel in the current channel. Both shortcuts are administrator-only.
- `/setowner role:<role>` can only be run by the server owner. The selected role and server owner can use **Processing**, **Complete**, and **Cancel** buttons. Closed orders leave the active queue.
- `/setadmin role:<role>` can be run by a server administrator and grants the selected role access to `/order` and `/claim`.
- `/setorder channel:#orders` can be run by a server administrator to choose where new order embeds are posted. Each order also shows the channel where `/order` was submitted.
- `/setup channel:<channel> staff_role:<optional>` changes the public order channel and staff role.

Order and server setup data are stored in `data/orders.json` on disk. Back up that file to preserve the queue between deployments.

Run `npm test` for the order-store checks.