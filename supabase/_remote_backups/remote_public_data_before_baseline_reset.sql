SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict dkN5XYQEtPBnJdAKWKReXfDfFubFJArNnGnhyPVUZZXca6NkWYSfVYhx0bs77Of

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: admin_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."admin_role" ("id", "user_id", "role", "status", "created_at", "updated_at") VALUES
	('461cc8b3-6bea-4619-a368-69a08eb9502e', '98f6aa20-d372-442f-a94f-f0262fc7ad40', 'admin', 'active', '2026-07-12 16:14:57+00', '2026-07-12 16:15:00+00');


--
-- Data for Name: agent_profile; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: analytics_agent_daily; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: analytics_daily; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: analytics_product_daily; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contact_inquiry; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: customer; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: customer_order; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: customer_order_item; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: customer_order_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: invoice; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: media_asset; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: page; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."page" ("id", "slug", "title", "status", "created_by", "updated_by", "published_at", "created_at", "updated_at") VALUES
	('5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'home', 'Home', 'published', NULL, NULL, '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00'),
	('e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'our-story', 'Our Story', 'published', NULL, NULL, '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00'),
	('2199fcb7-c0b8-4f80-9a4e-34f83d50ab93', 'shop', 'Shop', 'published', NULL, NULL, '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00'),
	('92c4df4e-4043-4fed-8793-bf1fd5b09cfd', 'business', 'Business', 'published', NULL, NULL, '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00'),
	('740f7820-1248-4faf-a526-cb7d8f093381', 'contact', 'Contact', 'published', NULL, NULL, '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00', '2026-06-30 10:26:11.076235+00');


--
-- Data for Name: page_section; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."page_section" ("id", "page_id", "type", "sort_order", "content", "status", "created_at", "updated_at") VALUES
	('661b0bfd-8082-4b5c-a36c-d6478e60d971', '92c4df4e-4043-4fed-8793-bf1fd5b09cfd', 'reseller_placeholder', 0, '{"heading": "Business inquiries", "summary": "Temporary business page copy. The reseller application workflow is implemented in a later phase.", "priceList": "Reseller price-list sending is not active in this mock content."}', 'published', '2026-06-30 15:57:56.935539+00', '2026-06-30 15:57:56.935539+00'),
	('2f949b18-d3c2-4e23-ab42-fda7b4717e10', '5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'hero', 0, '{"heading": "FROM FARM TO TABLE"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:18:12.588496+00'),
	('5ff5f960-11e5-4ee3-a6a5-e71b209ad6bd', '5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'taglines', 3, '{"items": ["Fresh - Quality - Trusted", "From farmers to Families -Quality You Can Trust"], "heading": "Taglines"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('eb8f6496-8ea8-4fe9-8395-a471274f2895', '5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'about', 1, '{"body": "Established in 2020, JeHMarP Meatshop is built on a rich, 20-year family legacy rooted deeply in the meat industry. What began with a dedicated mother figure selling meat in the public market has evolved into a multi-generational, family-run business that handles everything from raising hogs to retail distribution. The name JeHMarP stands for \"Jesus Helps Mary''s People\" - a constant reminder that our journey is guided by faith and strengthened by our community. Today, we work hand-in-hand with local farmers to deliver top-notch, custom-cut fresh pork and chicken daily to families in Compostela and Consolacion. With every purchase, you are not just getting guaranteed freshness and honest pricing; you are supporting local agriculture and community livelihoods.", "heading": "THE MEATSHOP", "summary": "From Farm to Table, Guided by Faith and Family"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('81bdc416-e3f7-4f0c-8d00-8bbebb3a5c6f', '5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'mission_vision_core_values', 2, '{"vision": "To be the community''s premier, multi-generational farm-to-table partner, delivering top-notch freshness, quality, and safety you can trust, while continually lifting up local agriculture and community livelihoods with every purchase.", "heading": "Mission, Vision, and Core Values", "mission": "Provide fresh meat daily to our customers. Support local farmers and hog raisers to strengthen local agriculture. Serve families with honesty, dedication, and care. Maintain affordable, budget-friendly pricing for every family.", "coreValues": ["F - Family & Faith: A multi-generational, family-run business built on a foundation of faith, family ties, and a journey guided by spiritual purpose (\"Jesus Helps Mary''s People\").", "A - Affordable & Fair Pricing: Committed to offering premium, quality meats at budget-friendly rates so every family has access to great food.", "I - Integrity & Honesty: Serving our customers and partners with genuine transparency, honest practices, and deep-rooted dedication.", "T - Top-Notch Freshness: Ensuring a daily supply of carefully handled, clean, safe, and strictly inspected fresh meat.", "H - Hometown & Community-Centered: Actively backing local hog raisers, supporting hometown livelihoods, and giving back to the community that has sustained us."]}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('cb791ec3-d3ec-4888-ac4c-f0862a5abf79', '5c7ac13e-80a0-463f-ba5d-f5d4abf0c006', 'images_gallery', 4, '{"images": [{"alt": "JEHMARP meatshop team and fresh meat preparation.", "src": "/images/about_photo.png"}, {"alt": "Fresh pork belly cuts prepared for customers.", "src": "/images/pork_belly.png"}, {"alt": "Fresh chicken breast cuts available at JEHMARP.", "src": "/images/chicken_breast.png"}], "heading": "Images Gallery"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('65bb1499-0df9-4de3-bc54-6eb34fd406bc', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'intro', 0, '{"heading": "Our Story", "summary": "JeHMarP Meatshop is not just a business - it is a story of faith, family, and experience passed from one generation to another."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('b5a19f9d-d75a-4401-a8d3-a2d047914504', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'heritage', 1, '{"heading": "More Than 20 Years", "summary": "For more than 20 years, our family has been deeply rooted in the meat industry. It all started with a mother figure who dedicated her life to selling meat in the public market - building trust, ensuring quality, and serving the community with honesty."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('fdf5d6db-ae17-41bc-a92c-d34e88742867', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'next_generation', 2, '{"heading": "The Next Generation", "summary": "As time passed, this responsibility was continued by the next generation - strengthening the foundation of knowledge, experience, and customer relationships."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('895bce5c-14d2-48e8-93d8-6f5387c35daa', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'turning_point', 3, '{"heading": "The Turning Point", "summary": "At the same time, we began raising hogs ourselves. This became the turning point. It was here that JeHMarP was born."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('0d75affd-0628-400b-93ea-a9c5925bb093', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'name_meaning', 4, '{"heading": "What JeHMarP Means", "summary": "The name represents not just a business, but the people behind it - \"Jesus Helps Mary''s People\" - a reminder that this journey is guided by faith and strengthened by the farmers, partners, and community who are part of it."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('eb8db4d0-c9c2-435a-aa76-134d7b273c41', 'e7fdef2b-a178-4689-b9cd-c9d9785f7098', 'today', 5, '{"heading": "Today", "summary": "Today, JeHMarP continues to grow - from hog raising to meat retail - bringing fresh, quality pork directly from farm to table."}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('9aa308ab-b4a5-493c-9bcf-5f7fa7007178', '740f7820-1248-4faf-a526-cb7d8f093381', 'contact_details', 0, '{"email": "jehmarp2020@gmail.com", "phone": "09322159289 | 09177770118", "heading": "Contact details", "location": "Compostela Public Market | Consolacion Public Market", "storeHours": "Open Daily (3:00AM - 8:00PM)"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00'),
	('24a28920-506d-4f5c-913f-1966239cadc7', '740f7820-1248-4faf-a526-cb7d8f093381', 'ordering_note', 1, '{"heading": "Ordering note", "summary": "Guest orders can be submitted from the shop page for review and confirmation by the JEHMARP team.", "responseWindow": "Store hours: Open Daily (3:00AM - 8:00PM)"}', 'published', '2026-07-05 18:15:05.604912+00', '2026-07-05 18:15:05.604912+00');


--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profile; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: reseller_application; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Name: invoice_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."invoice_number_seq"', 4, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict dkN5XYQEtPBnJdAKWKReXfDfFubFJArNnGnhyPVUZZXca6NkWYSfVYhx0bs77Of

RESET ALL;
