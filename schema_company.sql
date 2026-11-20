--
-- PostgreSQL database dump
--

\restrict IXpk7MVFxv7qhR02Y6W0t9zssh2B9oeqrMCPZTBOwU0sISnCPWknTrOsl8gFM5a

-- Dumped from database version 18.7
-- Dumped by pg_dump version 18.7

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
-- Name: alloc_doc_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.alloc_doc_type AS ENUM (
    'sale_order',
    'purchase_order',
    'invoice'
);


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


--
-- Name: bank_account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.bank_account_type AS ENUM (
    'bank',
    'cash',
    'clearing'
);


--
-- Name: company_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.company_type AS ENUM (
    'legal',
    'individual'
);


--
-- Name: doc_type_movement; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.doc_type_movement AS ENUM (
    'purchase',
    'sale',
    'transfer',
    'write_off',
    'return',
    'opening_balance'
);


--
-- Name: fin_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fin_direction AS ENUM (
    'incoming',
    'outgoing',
    'any'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'draft',
    'posted',
    'cancelled'
);


--
-- Name: overhead_doc_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.overhead_doc_type AS ENUM (
    'purchase',
    'sale'
);


--
-- Name: payment_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_direction AS ENUM (
    'incoming',
    'outgoing'
);


--
-- Name: payment_type_order; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_type_order AS ENUM (
    'cash',
    'credit'
);


--
-- Name: po_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.po_status AS ENUM (
    'draft',
    'exported',
    'accepted',
    'rejected'
);


--
-- Name: print_doc_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.print_doc_type AS ENUM (
    'sale',
    'purchase',
    'return',
    'payment'
);


--
-- Name: print_form_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.print_form_type AS ENUM (
    'torg12',
    'upd',
    'invoice',
    'account',
    'return_act'
);


--
-- Name: print_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.print_format AS ENUM (
    'pdf',
    'excel',
    'print'
);


--
-- Name: report_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_type AS ENUM (
    'sales',
    'supply',
    'debtors',
    'movements'
);


--
-- Name: stmt_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stmt_direction AS ENUM (
    'debit',
    'credit',
    'in',
    'out'
);


--
-- Name: sync_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_direction AS ENUM (
    'outgoing',
    'incoming'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'pending',
    'processing',
    'done',
    'error'
);


--
-- Name: sync_system; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_system AS ENUM (
    '1c',
    'bank'
);


--
-- Name: write_off_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.write_off_reason AS ENUM (
    'damage',
    'expiry',
    'loss',
    'other'
);


--
-- Name: recalculate_stock_on_movement_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_stock_on_movement_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
          BEGIN
            UPDATE stock
            SET qty = COALESCE((
              SELECT SUM(qty) FROM stock_movements
              WHERE batch_id = OLD.batch_id
              AND warehouse_id = OLD.warehouse_id
            ), 0)
            WHERE batch_id = OLD.batch_id
            AND warehouse_id = OLD.warehouse_id;
            RETURN OLD;
          END;
          $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    user_id integer,
    table_name character varying(100),
    record_id integer,
    action public.audit_action,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id integer NOT NULL,
    company_id integer,
    name character varying(255) NOT NULL,
    type public.bank_account_type,
    currency_id integer,
    account_number character varying(50),
    bik character varying(9),
    bank_name character varying(255),
    balance numeric(15,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false
);


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_accounts_id_seq OWNED BY public.bank_accounts.id;


--
-- Name: bank_statement_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statement_lines (
    id bigint NOT NULL,
    statement_id integer NOT NULL,
    operation_date date NOT NULL,
    amount numeric(15,2) NOT NULL,
    direction public.stmt_direction,
    counterparty_name character varying(500),
    purpose text,
    payment_id integer,
    is_matched boolean DEFAULT false,
    status character varying(20) DEFAULT 'new'::character varying,
    counterparty_id integer,
    counterparty_inn character varying(20),
    doc_number character varying(100)
);


--
-- Name: bank_statement_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_statement_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_statement_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_statement_lines_id_seq OWNED BY public.bank_statement_lines.id;


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statements (
    id integer NOT NULL,
    bank_account_id integer,
    period_from date,
    period_to date,
    imported_at timestamp with time zone DEFAULT now(),
    imported_by integer,
    date_from date,
    date_to date,
    source character varying(50) DEFAULT 'manual'::character varying,
    loaded_at timestamp with time zone DEFAULT now(),
    bank_id character varying(64)
);


--
-- Name: bank_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_statements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_statements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_statements_id_seq OWNED BY public.bank_statements.id;


--
-- Name: batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batches (
    id integer NOT NULL,
    product_id integer,
    unit_id integer,
    country_id integer,
    grade_id integer,
    batch_number character varying(100),
    serial_number character varying(100),
    production_date date,
    expiry_date date,
    supplier_id integer
);


--
-- Name: batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.batches_id_seq OWNED BY public.batches.id;


--
-- Name: cashflow_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashflow_plan (
    id integer NOT NULL,
    planned_date date NOT NULL,
    direction public.payment_direction,
    article_id integer,
    bank_account_id integer,
    counterparty_id integer,
    currency_id integer,
    amount numeric(15,2) NOT NULL,
    payment_id integer,
    is_executed boolean DEFAULT false,
    comment text
);


--
-- Name: cashflow_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cashflow_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cashflow_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cashflow_plan_id_seq OWNED BY public.cashflow_plan.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    inn character varying(12),
    kpp character varying(9),
    type public.company_type,
    parent_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: counterparties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    type public.company_type,
    category_id integer,
    inn character varying(12),
    kpp character varying(9),
    phone character varying(50),
    email character varying(255),
    address character varying(500),
    credit_limit numeric(15,2),
    credit_days integer,
    currency_id integer,
    is_anonymous boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: counterparties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.counterparties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: counterparties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.counterparties_id_seq OWNED BY public.counterparties.id;


--
-- Name: counterparty_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty_aliases (
    id integer NOT NULL,
    counterparty_id integer NOT NULL,
    alias_name character varying(255) NOT NULL,
    inn character varying(20),
    note character varying(255),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: counterparty_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.counterparty_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: counterparty_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.counterparty_aliases_id_seq OWNED BY public.counterparty_aliases.id;


--
-- Name: orders_purchase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders_purchase (
    id integer NOT NULL,
    number character varying(50),
    counterparty_id integer,
    warehouse_id integer,
    company_id integer,
    currency_id integer,
    currency_rate numeric(15,6),
    status public.order_status DEFAULT 'draft'::public.order_status,
    total_amount numeric(15,2),
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    note text
);


--
-- Name: orders_sale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders_sale (
    id integer NOT NULL,
    number character varying(50),
    payment_type public.payment_type_order,
    counterparty_id integer,
    cash_account_id integer,
    warehouse_id integer,
    company_id integer,
    currency_id integer,
    currency_rate numeric(15,6),
    status public.order_status DEFAULT 'draft'::public.order_status,
    delivery_date date,
    total_amount numeric(15,2),
    paid_amount numeric(15,2) DEFAULT 0,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    note text
);


--
-- Name: counterparty_balance; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.counterparty_balance AS
 SELECT cp.id AS counterparty_id,
    COALESCE(os.company_id, op.company_id) AS company_id,
    COALESCE(os.currency_id, op.currency_id) AS currency_id,
    COALESCE((sum(os.total_amount) - sum(os.paid_amount)), (0)::numeric) AS debt_sale,
    (0)::numeric(15,2) AS debt_purchase,
    COALESCE((sum(os.total_amount) - sum(os.paid_amount)), (0)::numeric) AS balance,
    COALESCE(max((EXTRACT(day FROM (now() - os.created_at)))::integer), 0) AS overdue_days,
    now() AS refreshed_at
   FROM ((public.counterparties cp
     LEFT JOIN public.orders_sale os ON (((os.counterparty_id = cp.id) AND (os.status = 'posted'::public.order_status))))
     LEFT JOIN public.orders_purchase op ON (((op.counterparty_id = cp.id) AND (op.status = 'posted'::public.order_status))))
  GROUP BY cp.id, COALESCE(os.company_id, op.company_id), COALESCE(os.currency_id, op.currency_id)
  WITH NO DATA;


--
-- Name: counterparty_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty_categories (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: counterparty_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.counterparty_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: counterparty_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.counterparty_categories_id_seq OWNED BY public.counterparty_categories.id;


--
-- Name: counterparty_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty_users (
    id integer NOT NULL,
    counterparty_id integer NOT NULL,
    login character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: counterparty_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.counterparty_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: counterparty_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.counterparty_users_id_seq OWNED BY public.counterparty_users.id;


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    alpha2 character(2),
    alpha3 character(3),
    numeric_code character(3)
);


--
-- Name: countries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.countries_id_seq OWNED BY public.countries.id;


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id integer NOT NULL,
    code character(3) NOT NULL,
    name character varying(50),
    symbol character varying(5),
    is_base boolean DEFAULT false
);


--
-- Name: currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.currencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: currencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.currencies_id_seq OWNED BY public.currencies.id;


--
-- Name: currency_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_rates (
    id integer NOT NULL,
    currency_id integer NOT NULL,
    rate_date date NOT NULL,
    rate numeric(15,6) NOT NULL,
    source character varying(50)
);


--
-- Name: currency_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.currency_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: currency_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.currency_rates_id_seq OWNED BY public.currency_rates.id;


--
-- Name: debt_writeoffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_writeoffs (
    id integer NOT NULL,
    number character varying(50) NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    counterparty_id integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency_id integer,
    note text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: debt_writeoffs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.debt_writeoffs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: debt_writeoffs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.debt_writeoffs_id_seq OWNED BY public.debt_writeoffs.id;


--
-- Name: document_prints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_prints (
    id integer NOT NULL,
    document_type public.print_doc_type,
    document_id integer NOT NULL,
    form_type public.print_form_type,
    format public.print_format,
    file_url character varying(500),
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    sent_to character varying(500)
);


--
-- Name: document_prints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_prints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_prints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_prints_id_seq OWNED BY public.document_prints.id;


--
-- Name: finance_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_articles (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    direction public.fin_direction,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: finance_articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.finance_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: finance_articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.finance_articles_id_seq OWNED BY public.finance_articles.id;


--
-- Name: grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grades (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: grades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grades_id_seq OWNED BY public.grades.id;


--
-- Name: inter_company_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inter_company_documents (
    id integer NOT NULL,
    doc_type character varying(20) NOT NULL,
    direction character varying(10) NOT NULL,
    partner_company_id integer NOT NULL,
    partner_company_name character varying(255),
    local_doc_id integer,
    local_doc_number character varying(50),
    doc_date date NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'RUB'::character varying NOT NULL,
    lines jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    dispute_comment text,
    mirror_id integer,
    created_at timestamp with time zone DEFAULT now(),
    confirmed_at timestamp with time zone
);


--
-- Name: inter_company_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inter_company_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inter_company_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inter_company_documents_id_seq OWNED BY public.inter_company_documents.id;


--
-- Name: legal_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_entities (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    inn character varying(12),
    kpp character varying(9),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: legal_entities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_entities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_entities_id_seq OWNED BY public.legal_entities.id;


--
-- Name: order_purchase_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_purchase_lines (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    batch_id integer,
    grade_id integer,
    country_id integer,
    unit_id integer,
    qty numeric(15,3) NOT NULL,
    price numeric(15,4),
    vat_pct numeric(5,2) DEFAULT 20,
    amount numeric(15,2) GENERATED ALWAYS AS (round(((qty * price) * ((1)::numeric + (vat_pct / (100)::numeric))), 2)) STORED
);


--
-- Name: order_purchase_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_purchase_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_purchase_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_purchase_lines_id_seq OWNED BY public.order_purchase_lines.id;


--
-- Name: order_sale_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_sale_lines (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    batch_id integer,
    qty numeric(15,3) NOT NULL,
    price numeric(15,4),
    discount_pct numeric(5,2) DEFAULT 0,
    vat_pct numeric(5,2) DEFAULT 20,
    amount numeric(15,2) GENERATED ALWAYS AS (round((((qty * price) * ((1)::numeric - (discount_pct / (100)::numeric))) * ((1)::numeric + (vat_pct / (100)::numeric))), 2)) STORED
);


--
-- Name: order_sale_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_sale_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_sale_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_sale_lines_id_seq OWNED BY public.order_sale_lines.id;


--
-- Name: orders_purchase_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_purchase_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_purchase_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_purchase_id_seq OWNED BY public.orders_purchase.id;


--
-- Name: orders_sale_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_sale_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_sale_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_sale_id_seq OWNED BY public.orders_sale.id;


--
-- Name: overhead_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.overhead_costs (
    id integer NOT NULL,
    article_id integer,
    document_type public.overhead_doc_type,
    document_id integer NOT NULL,
    counterparty_id integer,
    batch_id integer,
    amount numeric(15,2) NOT NULL,
    currency_id integer,
    currency_rate numeric(15,6),
    payment_id integer,
    is_allocated boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: overhead_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.overhead_costs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: overhead_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.overhead_costs_id_seq OWNED BY public.overhead_costs.id;


--
-- Name: payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_allocations (
    id integer NOT NULL,
    payment_id integer NOT NULL,
    document_type public.alloc_doc_type,
    document_id integer NOT NULL,
    amount numeric(15,2) NOT NULL
);


--
-- Name: payment_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_allocations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_allocations_id_seq OWNED BY public.payment_allocations.id;


--
-- Name: payment_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_orders (
    id integer NOT NULL,
    payment_id integer,
    bank_account_id integer,
    status public.po_status DEFAULT 'draft'::public.po_status,
    exported_at timestamp with time zone,
    bank_ref character varying(100),
    format character varying(20),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_orders_id_seq OWNED BY public.payment_orders.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    number character varying(50),
    direction public.payment_direction,
    article_id integer,
    bank_account_id integer,
    counterparty_id integer,
    currency_id integer,
    currency_rate numeric(15,6),
    amount numeric(15,2) NOT NULL,
    amount_base numeric(15,2) NOT NULL,
    payment_date date NOT NULL,
    purpose text,
    status public.order_status DEFAULT 'draft'::public.order_status,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    order_id integer,
    return_id integer,
    note text,
    legal_name character varying(255),
    pp_number character varying(100)
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    module character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    description character varying(255)
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true
);


--
-- Name: product_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_categories_id_seq OWNED BY public.product_categories.id;


--
-- Name: product_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_grades (
    product_id integer NOT NULL,
    grade_id integer NOT NULL
);


--
-- Name: product_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_links (
    id integer NOT NULL,
    partner_company_id integer NOT NULL,
    partner_product_name character varying(255) NOT NULL,
    local_product_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_links_id_seq OWNED BY public.product_links.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    sku character varying(100),
    name character varying(500) NOT NULL,
    category_id integer,
    default_unit_id integer,
    default_country_id integer,
    default_grade_id integer,
    has_serial boolean DEFAULT false,
    has_batch boolean DEFAULT false,
    min_stock numeric(15,3),
    weight_kg numeric(10,4),
    is_active boolean DEFAULT true
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: reconciliation_acts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_acts (
    id integer NOT NULL,
    partner_company_id integer NOT NULL,
    partner_company_name character varying(255),
    date_from date NOT NULL,
    date_to date NOT NULL,
    our_balance numeric(15,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    snapshot jsonb,
    dispute_comment text,
    mirror_id integer,
    created_at timestamp with time zone DEFAULT now(),
    agreed_at timestamp with time zone
);


--
-- Name: reconciliation_acts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reconciliation_acts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reconciliation_acts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reconciliation_acts_id_seq OWNED BY public.reconciliation_acts.id;


--
-- Name: report_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_templates (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    report_type public.report_type,
    params jsonb,
    created_by integer,
    is_shared boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: report_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.report_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: report_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.report_templates_id_seq OWNED BY public.report_templates.id;


--
-- Name: return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_lines (
    id integer NOT NULL,
    return_id integer NOT NULL,
    product_id integer,
    batch_id integer,
    qty numeric(15,3) NOT NULL,
    price numeric(15,4),
    amount numeric(15,2) GENERATED ALWAYS AS (round((qty * price), 2)) STORED
);


--
-- Name: return_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.return_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: return_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.return_lines_id_seq OWNED BY public.return_lines.id;


--
-- Name: returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returns (
    id integer NOT NULL,
    number character varying(50),
    order_id integer,
    counterparty_id integer,
    warehouse_id integer,
    date date NOT NULL,
    reason text,
    status public.order_status DEFAULT 'draft'::public.order_status,
    total_amount numeric(15,2),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.returns_id_seq OWNED BY public.returns.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    is_allowed boolean DEFAULT true
);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock (
    id integer NOT NULL,
    warehouse_id integer NOT NULL,
    product_id integer NOT NULL,
    batch_id integer,
    unit_id integer,
    qty numeric(15,3) DEFAULT 0 NOT NULL,
    cost_price numeric(15,4)
);


--
-- Name: stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_id_seq OWNED BY public.stock.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    document_type public.doc_type_movement,
    document_id integer NOT NULL,
    warehouse_id integer,
    product_id integer,
    batch_id integer,
    qty numeric(15,3),
    cost_price numeric(15,4),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_queue (
    id bigint NOT NULL,
    system public.sync_system,
    direction public.sync_direction,
    entity_type character varying(100),
    entity_id integer NOT NULL,
    status public.sync_status DEFAULT 'pending'::public.sync_status,
    payload jsonb,
    error_message text,
    attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone
);


--
-- Name: sync_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_queue_id_seq OWNED BY public.sync_queue.id;


--
-- Name: transfer_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_lines (
    id integer NOT NULL,
    transfer_id integer NOT NULL,
    product_id integer,
    batch_id integer,
    qty numeric(15,3) NOT NULL,
    cost_price numeric(15,4),
    transfer_price numeric(15,4)
);


--
-- Name: transfer_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transfer_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transfer_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transfer_lines_id_seq OWNED BY public.transfer_lines.id;


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfers (
    id integer NOT NULL,
    number character varying(50),
    from_warehouse_id integer,
    to_warehouse_id integer,
    comment text,
    status character varying(20) DEFAULT 'posted'::character varying,
    total_amount numeric(15,2) DEFAULT 0,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transfers_id_seq OWNED BY public.transfers.id;


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    short_name character varying(10),
    okei_code character varying(10)
);


--
-- Name: units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.units_id_seq OWNED BY public.units.id;


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_permissions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    section character varying(100) NOT NULL,
    access character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_permissions_id_seq OWNED BY public.user_permissions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    login character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255),
    email character varying(255),
    role_id integer,
    company_id integer,
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    date_restrict boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    company_id integer,
    address text,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false
);


--
-- Name: warehouses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouses_id_seq OWNED BY public.warehouses.id;


--
-- Name: write_off_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.write_off_lines (
    id integer NOT NULL,
    write_off_id integer NOT NULL,
    product_id integer,
    batch_id integer,
    qty numeric(15,3) NOT NULL,
    cost_price numeric(15,4),
    amount numeric(15,2) DEFAULT 0
);


--
-- Name: write_off_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.write_off_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: write_off_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.write_off_lines_id_seq OWNED BY public.write_off_lines.id;


--
-- Name: write_offs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.write_offs (
    id integer NOT NULL,
    number character varying(50),
    warehouse_id integer,
    reason public.write_off_reason,
    comment text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'posted'::character varying,
    total_amount numeric(15,2) DEFAULT 0,
    date date
);


--
-- Name: write_offs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.write_offs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: write_offs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.write_offs_id_seq OWNED BY public.write_offs.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: bank_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts ALTER COLUMN id SET DEFAULT nextval('public.bank_accounts_id_seq'::regclass);


--
-- Name: bank_statement_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines ALTER COLUMN id SET DEFAULT nextval('public.bank_statement_lines_id_seq'::regclass);


--
-- Name: bank_statements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements ALTER COLUMN id SET DEFAULT nextval('public.bank_statements_id_seq'::regclass);


--
-- Name: batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches ALTER COLUMN id SET DEFAULT nextval('public.batches_id_seq'::regclass);


--
-- Name: cashflow_plan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan ALTER COLUMN id SET DEFAULT nextval('public.cashflow_plan_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: counterparties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties ALTER COLUMN id SET DEFAULT nextval('public.counterparties_id_seq'::regclass);


--
-- Name: counterparty_aliases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_aliases ALTER COLUMN id SET DEFAULT nextval('public.counterparty_aliases_id_seq'::regclass);


--
-- Name: counterparty_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_categories ALTER COLUMN id SET DEFAULT nextval('public.counterparty_categories_id_seq'::regclass);


--
-- Name: counterparty_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_users ALTER COLUMN id SET DEFAULT nextval('public.counterparty_users_id_seq'::regclass);


--
-- Name: countries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries ALTER COLUMN id SET DEFAULT nextval('public.countries_id_seq'::regclass);


--
-- Name: currencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies ALTER COLUMN id SET DEFAULT nextval('public.currencies_id_seq'::regclass);


--
-- Name: currency_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rates ALTER COLUMN id SET DEFAULT nextval('public.currency_rates_id_seq'::regclass);


--
-- Name: debt_writeoffs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_writeoffs ALTER COLUMN id SET DEFAULT nextval('public.debt_writeoffs_id_seq'::regclass);


--
-- Name: document_prints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_prints ALTER COLUMN id SET DEFAULT nextval('public.document_prints_id_seq'::regclass);


--
-- Name: finance_articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_articles ALTER COLUMN id SET DEFAULT nextval('public.finance_articles_id_seq'::regclass);


--
-- Name: grades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades ALTER COLUMN id SET DEFAULT nextval('public.grades_id_seq'::regclass);


--
-- Name: inter_company_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inter_company_documents ALTER COLUMN id SET DEFAULT nextval('public.inter_company_documents_id_seq'::regclass);


--
-- Name: legal_entities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities ALTER COLUMN id SET DEFAULT nextval('public.legal_entities_id_seq'::regclass);


--
-- Name: order_purchase_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines ALTER COLUMN id SET DEFAULT nextval('public.order_purchase_lines_id_seq'::regclass);


--
-- Name: order_sale_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sale_lines ALTER COLUMN id SET DEFAULT nextval('public.order_sale_lines_id_seq'::regclass);


--
-- Name: orders_purchase id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase ALTER COLUMN id SET DEFAULT nextval('public.orders_purchase_id_seq'::regclass);


--
-- Name: orders_sale id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale ALTER COLUMN id SET DEFAULT nextval('public.orders_sale_id_seq'::regclass);


--
-- Name: overhead_costs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs ALTER COLUMN id SET DEFAULT nextval('public.overhead_costs_id_seq'::regclass);


--
-- Name: payment_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations ALTER COLUMN id SET DEFAULT nextval('public.payment_allocations_id_seq'::regclass);


--
-- Name: payment_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_orders ALTER COLUMN id SET DEFAULT nextval('public.payment_orders_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: product_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories ALTER COLUMN id SET DEFAULT nextval('public.product_categories_id_seq'::regclass);


--
-- Name: product_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_links ALTER COLUMN id SET DEFAULT nextval('public.product_links_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: reconciliation_acts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_acts ALTER COLUMN id SET DEFAULT nextval('public.reconciliation_acts_id_seq'::regclass);


--
-- Name: report_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_templates ALTER COLUMN id SET DEFAULT nextval('public.report_templates_id_seq'::regclass);


--
-- Name: return_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines ALTER COLUMN id SET DEFAULT nextval('public.return_lines_id_seq'::regclass);


--
-- Name: returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns ALTER COLUMN id SET DEFAULT nextval('public.returns_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock ALTER COLUMN id SET DEFAULT nextval('public.stock_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: sync_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_queue ALTER COLUMN id SET DEFAULT nextval('public.sync_queue_id_seq'::regclass);


--
-- Name: transfer_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_lines ALTER COLUMN id SET DEFAULT nextval('public.transfer_lines_id_seq'::regclass);


--
-- Name: transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers ALTER COLUMN id SET DEFAULT nextval('public.transfers_id_seq'::regclass);


--
-- Name: units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units ALTER COLUMN id SET DEFAULT nextval('public.units_id_seq'::regclass);


--
-- Name: user_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions ALTER COLUMN id SET DEFAULT nextval('public.user_permissions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: warehouses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses ALTER COLUMN id SET DEFAULT nextval('public.warehouses_id_seq'::regclass);


--
-- Name: write_off_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_off_lines ALTER COLUMN id SET DEFAULT nextval('public.write_off_lines_id_seq'::regclass);


--
-- Name: write_offs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_offs ALTER COLUMN id SET DEFAULT nextval('public.write_offs_id_seq'::regclass);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_statement_lines bank_statement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: cashflow_plan cashflow_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: counterparties counterparties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_pkey PRIMARY KEY (id);


--
-- Name: counterparty_aliases counterparty_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_aliases
    ADD CONSTRAINT counterparty_aliases_pkey PRIMARY KEY (id);


--
-- Name: counterparty_categories counterparty_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_categories
    ADD CONSTRAINT counterparty_categories_pkey PRIMARY KEY (id);


--
-- Name: counterparty_users counterparty_users_login_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_users
    ADD CONSTRAINT counterparty_users_login_key UNIQUE (login);


--
-- Name: counterparty_users counterparty_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_users
    ADD CONSTRAINT counterparty_users_pkey PRIMARY KEY (id);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_key UNIQUE (code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currency_rates currency_rates_currency_id_rate_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_currency_id_rate_date_key UNIQUE (currency_id, rate_date);


--
-- Name: currency_rates currency_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_pkey PRIMARY KEY (id);


--
-- Name: debt_writeoffs debt_writeoffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_writeoffs
    ADD CONSTRAINT debt_writeoffs_pkey PRIMARY KEY (id);


--
-- Name: document_prints document_prints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_prints
    ADD CONSTRAINT document_prints_pkey PRIMARY KEY (id);


--
-- Name: finance_articles finance_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_articles
    ADD CONSTRAINT finance_articles_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: inter_company_documents inter_company_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inter_company_documents
    ADD CONSTRAINT inter_company_documents_pkey PRIMARY KEY (id);


--
-- Name: legal_entities legal_entities_inn_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities
    ADD CONSTRAINT legal_entities_inn_unique UNIQUE (inn);


--
-- Name: legal_entities legal_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_entities
    ADD CONSTRAINT legal_entities_pkey PRIMARY KEY (id);


--
-- Name: order_purchase_lines order_purchase_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_pkey PRIMARY KEY (id);


--
-- Name: order_sale_lines order_sale_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sale_lines
    ADD CONSTRAINT order_sale_lines_pkey PRIMARY KEY (id);


--
-- Name: orders_purchase orders_purchase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT orders_purchase_pkey PRIMARY KEY (id);


--
-- Name: orders_sale orders_sale_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_pkey PRIMARY KEY (id);


--
-- Name: overhead_costs overhead_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_pkey PRIMARY KEY (id);


--
-- Name: payment_allocations payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: payment_orders payment_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_orders
    ADD CONSTRAINT payment_orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_number_key UNIQUE (number);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_module_action_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_module_action_key UNIQUE (module, action);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_grades product_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades
    ADD CONSTRAINT product_grades_pkey PRIMARY KEY (product_id, grade_id);


--
-- Name: product_links product_links_partner_company_id_partner_product_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_links
    ADD CONSTRAINT product_links_partner_company_id_partner_product_name_key UNIQUE (partner_company_id, partner_product_name);


--
-- Name: product_links product_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_links
    ADD CONSTRAINT product_links_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: reconciliation_acts reconciliation_acts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_acts
    ADD CONSTRAINT reconciliation_acts_pkey PRIMARY KEY (id);


--
-- Name: report_templates report_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_pkey PRIMARY KEY (id);


--
-- Name: return_lines return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_pkey PRIMARY KEY (id);


--
-- Name: returns returns_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_number_key UNIQUE (number);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_id_permission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_permission_id_key UNIQUE (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_pkey PRIMARY KEY (id);


--
-- Name: stock stock_warehouse_id_product_id_batch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_warehouse_id_product_id_batch_id_key UNIQUE (warehouse_id, product_id, batch_id);


--
-- Name: sync_queue sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);


--
-- Name: transfer_lines transfer_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_pkey PRIMARY KEY (id);


--
-- Name: transfers transfers_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_number_key UNIQUE (number);


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_user_id_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_section_key UNIQUE (user_id, section);


--
-- Name: users users_login_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_key UNIQUE (login);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: write_off_lines write_off_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_off_lines
    ADD CONSTRAINT write_off_lines_pkey PRIMARY KEY (id);


--
-- Name: write_offs write_offs_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_number_key UNIQUE (number);


--
-- Name: write_offs write_offs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_pkey PRIMARY KEY (id);


--
-- Name: counterparty_balance_counterparty_id_company_id_currency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX counterparty_balance_counterparty_id_company_id_currency_id_idx ON public.counterparty_balance USING btree (counterparty_id, company_id, currency_id);


--
-- Name: idx_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_table ON public.audit_log USING btree (table_name, record_id);


--
-- Name: idx_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_product ON public.batches USING btree (product_id);


--
-- Name: idx_counterparties_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_counterparties_name_unique ON public.counterparties USING btree (lower(TRIM(BOTH FROM name))) WHERE (is_active = true);


--
-- Name: idx_icd_local; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_icd_local ON public.inter_company_documents USING btree (doc_type, local_doc_id);


--
-- Name: idx_icd_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_icd_partner ON public.inter_company_documents USING btree (partner_company_id, doc_date);


--
-- Name: idx_icd_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_icd_status ON public.inter_company_documents USING btree (status);


--
-- Name: idx_movements_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_doc ON public.stock_movements USING btree (document_type, document_id);


--
-- Name: idx_movements_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_product ON public.stock_movements USING btree (product_id);


--
-- Name: idx_opur_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opur_counterparty ON public.orders_purchase USING btree (counterparty_id);


--
-- Name: idx_opur_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opur_status ON public.orders_purchase USING btree (status);


--
-- Name: idx_osal_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osal_counterparty ON public.orders_sale USING btree (counterparty_id);


--
-- Name: idx_osal_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osal_status ON public.orders_sale USING btree (status);


--
-- Name: idx_payments_cp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_cp ON public.payments USING btree (counterparty_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);


--
-- Name: idx_ra_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ra_partner ON public.reconciliation_acts USING btree (partner_company_id, date_from, date_to);


--
-- Name: idx_stock_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_product ON public.stock USING btree (product_id);


--
-- Name: idx_stock_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_warehouse ON public.stock USING btree (warehouse_id);


--
-- Name: idx_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_status ON public.sync_queue USING btree (status, system);


--
-- Name: orders_purchase_number_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_purchase_number_date_idx ON public.orders_purchase USING btree (number, ((created_at AT TIME ZONE 'UTC'::text)));


--
-- Name: orders_sale_number_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_sale_number_date_idx ON public.orders_sale USING btree (number, (((created_at AT TIME ZONE 'Europe/Moscow'::text))::date));


--
-- Name: stock_movements trg_recalc_stock_on_movement_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalc_stock_on_movement_delete AFTER DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.recalculate_stock_on_movement_delete();


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bank_accounts bank_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: bank_accounts bank_accounts_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: bank_statement_lines bank_statement_lines_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: bank_statement_lines bank_statement_lines_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: bank_statement_lines bank_statement_lines_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.bank_statements(id);


--
-- Name: bank_statements bank_statements_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: batches batches_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: batches batches_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.grades(id);


--
-- Name: batches batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: batches batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.counterparties(id);


--
-- Name: batches batches_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);


--
-- Name: cashflow_plan cashflow_plan_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.finance_articles(id);


--
-- Name: cashflow_plan cashflow_plan_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: cashflow_plan cashflow_plan_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: cashflow_plan cashflow_plan_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: cashflow_plan cashflow_plan_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashflow_plan
    ADD CONSTRAINT cashflow_plan_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: companies companies_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.companies(id);


--
-- Name: counterparties counterparties_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.counterparty_categories(id);


--
-- Name: counterparties counterparties_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: counterparty_aliases counterparty_aliases_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_aliases
    ADD CONSTRAINT counterparty_aliases_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE CASCADE;


--
-- Name: counterparty_users counterparty_users_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_users
    ADD CONSTRAINT counterparty_users_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE CASCADE;


--
-- Name: currency_rates currency_rates_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_rates
    ADD CONSTRAINT currency_rates_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: debt_writeoffs debt_writeoffs_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_writeoffs
    ADD CONSTRAINT debt_writeoffs_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: debt_writeoffs debt_writeoffs_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_writeoffs
    ADD CONSTRAINT debt_writeoffs_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: document_prints document_prints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_prints
    ADD CONSTRAINT document_prints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: finance_articles finance_articles_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_articles
    ADD CONSTRAINT finance_articles_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.finance_articles(id);


--
-- Name: bank_statements fk_bst_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT fk_bst_user FOREIGN KEY (imported_by) REFERENCES public.users(id);


--
-- Name: orders_purchase fk_opur_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT fk_opur_user FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: orders_sale fk_osal_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT fk_osal_user FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payments fk_pay_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_pay_user FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: returns fk_ret_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT fk_ret_user FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: write_offs fk_wo_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT fk_wo_user FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: order_purchase_lines order_purchase_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: order_purchase_lines order_purchase_lines_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id);


--
-- Name: order_purchase_lines order_purchase_lines_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.grades(id);


--
-- Name: order_purchase_lines order_purchase_lines_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_purchase(id);


--
-- Name: order_purchase_lines order_purchase_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: order_purchase_lines order_purchase_lines_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_purchase_lines
    ADD CONSTRAINT order_purchase_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);


--
-- Name: order_sale_lines order_sale_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sale_lines
    ADD CONSTRAINT order_sale_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: order_sale_lines order_sale_lines_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sale_lines
    ADD CONSTRAINT order_sale_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_sale(id);


--
-- Name: order_sale_lines order_sale_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sale_lines
    ADD CONSTRAINT order_sale_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders_purchase orders_purchase_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT orders_purchase_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: orders_purchase orders_purchase_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT orders_purchase_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: orders_purchase orders_purchase_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT orders_purchase_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: orders_purchase orders_purchase_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_purchase
    ADD CONSTRAINT orders_purchase_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: orders_sale orders_sale_cash_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_cash_account_id_fkey FOREIGN KEY (cash_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: orders_sale orders_sale_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: orders_sale orders_sale_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: orders_sale orders_sale_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: orders_sale orders_sale_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders_sale
    ADD CONSTRAINT orders_sale_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: overhead_costs overhead_costs_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.finance_articles(id);


--
-- Name: overhead_costs overhead_costs_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: overhead_costs overhead_costs_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: overhead_costs overhead_costs_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: overhead_costs overhead_costs_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overhead_costs
    ADD CONSTRAINT overhead_costs_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payment_allocations payment_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payment_orders payment_orders_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_orders
    ADD CONSTRAINT payment_orders_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: payment_orders payment_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_orders
    ADD CONSTRAINT payment_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payment_orders payment_orders_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_orders
    ADD CONSTRAINT payment_orders_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: payments payments_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.finance_articles(id);


--
-- Name: payments payments_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: payments payments_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: payments payments_currency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_sale(id) ON DELETE SET NULL;


--
-- Name: payments payments_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE SET NULL;


--
-- Name: product_grades product_grades_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades
    ADD CONSTRAINT product_grades_grade_id_fkey FOREIGN KEY (grade_id) REFERENCES public.grades(id);


--
-- Name: product_grades product_grades_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades
    ADD CONSTRAINT product_grades_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id);


--
-- Name: products products_default_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_country_id_fkey FOREIGN KEY (default_country_id) REFERENCES public.countries(id);


--
-- Name: products products_default_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_grade_id_fkey FOREIGN KEY (default_grade_id) REFERENCES public.grades(id);


--
-- Name: products products_default_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_unit_id_fkey FOREIGN KEY (default_unit_id) REFERENCES public.units(id);


--
-- Name: report_templates report_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_templates
    ADD CONSTRAINT report_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: return_lines return_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: return_lines return_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: return_lines return_lines_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_lines
    ADD CONSTRAINT return_lines_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.returns(id);


--
-- Name: returns returns_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id);


--
-- Name: returns returns_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders_sale(id);


--
-- Name: returns returns_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id);


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: stock stock_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: stock_movements stock_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_movements stock_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: stock stock_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock stock_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);


--
-- Name: stock stock_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock
    ADD CONSTRAINT stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: transfer_lines transfer_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: transfer_lines transfer_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: transfer_lines transfer_lines_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfers(id);


--
-- Name: transfers transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: transfers transfers_from_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: transfers transfers_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: warehouses warehouses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: write_off_lines write_off_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_off_lines
    ADD CONSTRAINT write_off_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: write_off_lines write_off_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_off_lines
    ADD CONSTRAINT write_off_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: write_off_lines write_off_lines_write_off_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_off_lines
    ADD CONSTRAINT write_off_lines_write_off_id_fkey FOREIGN KEY (write_off_id) REFERENCES public.write_offs(id);


--
-- Name: write_offs write_offs_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.write_offs
    ADD CONSTRAINT write_offs_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- PostgreSQL database dump complete
--

\unrestrict IXpk7MVFxv7qhR02Y6W0t9zssh2B9oeqrMCPZTBOwU0sISnCPWknTrOsl8gFM5a

