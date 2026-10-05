---
name: electronics-scm-commerce-api
description: Look up customer accounts, contracts and SLAs, trace manufacturing lots to affected customers, manage support cases, run product recall campaigns, handle warranty claims, schedule field service visits, issue credit memos, and file regulatory reports. Use when the user asks who received a defective lot, what a customer is owed contractually, recall cost or execution readiness, warranty exposure, support case volume, technician capacity, customer credit position, or regulatory notification obligations.
---

## Tools

```yaml
tools:
  # ---------------------------------------------------------------- customers
  - name: listCustomers
    description:
      Resolves a customer name, commercial tier, or sales region to canonical customer
      identifiers with annual revenue and active status. Prerequisite for most other
      customer-scoped operations. Use whenever the user names a customer rather than giving a
      customer id, or asks which customers match a segment.
    tags: [customers, read, lookup, utility, search]
    aliases: [find customer, customer id, account lookup, which customers, customer list, strategic accounts, by region]
    examples:
      - "what is the customer id for Acme"
      - "list our strategic accounts in North America"
    alwaysInclude: true

  - name: getCustomer
    description:
      Returns the full customer record including commercial tier, region, annual revenue,
      payment terms, assigned account manager, ship-to sites, and onboarding date. Use for
      background on a specific account.
    tags: [customers, read, master-data, account]
    aliases: [customer details, account info, payment terms, account manager, who owns the account, ship to sites]
    examples:
      - "tell me about Contoso Electronics"
      - "what payment terms and account manager does this customer have"

  - name: getCustomerContacts
    description:
      Returns named contacts for a customer with role, email, phone, escalation level, and
      preferred channel, optionally filtered by role such as quality or executive. Required
      before sending recall or safety notices, which must go to the designated quality
      contact. Use to find who to contact and how.
    tags: [customers, read, contacts, escalation, notification]
    aliases: [who do I contact, customer contact, quality contact, escalation contact, email address, executive sponsor]
    examples:
      - "who is the quality contact at Contoso"
      - "give me the escalation contacts for this account"

  - name: getCustomerHealthScore
    description:
      Returns a composite account-health score blending delivery performance, open cases,
      payment behaviour, and sentiment, with churn risk band, on-time delivery percentage,
      days sales outstanding, and at-risk revenue. Use to judge how much goodwill an account
      has before delivering bad news.
    tags: [customers, read, health, churn, risk, sentiment]
    aliases: [account health, churn risk, are they happy, at risk account, relationship health, customer sentiment]
    examples:
      - "how healthy is the Contoso relationship"
      - "which of these accounts is at churn risk"

  - name: getCustomerDeliveries
    description:
      Returns delivery history for a customer including SKU, manufacturing lot, quantity,
      delivery date, ship-to site, and value, optionally filtered by SKU or window. This is
      the customer-side counterpart to a supply-side shipment record. Use to see what a
      specific customer actually received.
    tags: [customers, read, deliveries, history, lot]
    aliases: [what did we ship them, delivery history, past deliveries, which lots did they get, shipment history]
    examples:
      - "what have we delivered to Acme in the last 180 days"
      - "which lots of SKU-4821 did this customer receive"

  # ---------------------------------------------------------------- traceability
  - name: traceLotToCustomers
    description:
      Forward traceability. Given one or more manufacturing lot identifiers, returns every
      customer that received units from those lots with quantities, delivery dates,
      destination sites, and financial exposure. This is the pivot operation for any recall
      or quality escalation. Use as soon as a defective lot id is known.
    tags: [traceability, write, recall, lot, exposure, impact]
    aliases: [who got the bad lot, trace the lot, which customers are affected, lot traceability, who received it, affected customers]
    examples:
      - "which customers received units from lot LOT-175302"
      - "trace this defective lot to the customers holding it"

  - name: getShipmentRecipients
    description:
      Resolves an outbound shipment identifier from the logistics system into the customers
      and delivery addresses on that shipment, with per-recipient delivery status and
      proof-of-delivery signatory. Use when a specific shipment is suspect rather than a whole
      lot.
    tags: [traceability, read, shipment, recipients, delivery]
    aliases: [who was on that shipment, shipment recipients, who received this shipment, proof of delivery, delivered to whom]
    examples:
      - "who received shipment SHP-418203"
      - "was that shipment actually delivered and signed for"

  - name: getAffectedUnitsSummary
    description:
      Aggregates traced units into disposition buckets covering already consumed, still in
      customer inventory, in transit, and already returned, distinguishing recoverable from
      unrecoverable units. Use to size how much of a recall is a physical field action versus
      a paper exercise.
    tags: [traceability, write, recall, disposition, recoverable]
    aliases: [how many can we recover, units consumed, still in inventory, recoverable units, disposition breakdown, how much is retrievable]
    examples:
      - "of the affected units how many can we still recover"
      - "break the traced units down by where they are now"

  # ---------------------------------------------------------------- contracts
  - name: listContracts
    description:
      Lists commercial contracts filtered by customer or expiry window, with contract type,
      dates, annual value, auto-renew flag, and whether an explicit product-recall clause
      exists. Use to find which agreement governs a customer relationship.
    tags: [contracts, read, commercial, agreement]
    aliases: [customer contracts, which contract, agreements, expiring contracts, recall clause, MSA, does a contract exist]
    examples:
      - "what contracts do we have with Contoso"
      - "which customer contracts expire in the next 90 days"

  - name: getContract
    description:
      Returns full contract detail including liability cap, recall notification window in
      hours, governing law, penalty mechanics, and signatory. Read this before committing to
      any remedy, because the cap constrains what can be offered. Use for obligations and
      liability limit questions.
    tags: [contracts, read, liability, legal, obligations]
    aliases: [liability cap, notification window, governing law, penalty terms, what are we obligated to do, contract terms]
    examples:
      - "what is our liability cap on contract CTR-669491"
      - "how many hours do we have to notify them of a safety issue"

  - name: getContractSla
    description:
      Returns the measurable service commitments on a contract with target versus current
      performance, which terms are in breach, the credit percentage owed per breach, quality
      PPM ceiling, and committed response time. Use to check whether we are already failing an
      account before a new incident lands.
    tags: [contracts, read, sla, performance, breach]
    aliases: [SLA terms, are we in breach, service level, OTD target, PPM ceiling, response time commitment, service credits]
    examples:
      - "are we currently in breach of any SLA terms with this customer"
      - "what service level did we commit to and how are we tracking"

  - name: evaluateSlaImpact
    description:
      Models the contractual consequence of a specific incident, returning which SLA terms it
      breaches, service credits and penalties triggered, total liability against the cap,
      whether formal notification is compelled, and a recommended commercial posture. Use to
      price the contractual cost of a quality or delivery failure.
    tags: [contracts, write, sla, liability, incident, penalties]
    aliases: [what does this cost us contractually, penalties, service credits owed, do we have to notify them, breach impact, contractual exposure]
    examples:
      - "what is the contractual impact of a critical safety recall on this contract"
      - "how much do we owe in credits and penalties for this incident"

  # ---------------------------------------------------------------- cases
  - name: listCases
    description:
      Lists customer support cases filtered by customer, related SKU, severity, or status, with
      subject, age, owning agent, and SLA due date. Use to detect whether customers are already
      reporting symptoms of a defect before it is formally identified.
    tags: [cases, read, support, escalation, tickets]
    aliases: [support cases, open tickets, complaints, escalations, are customers reporting problems, case backlog, critical cases]
    examples:
      - "are there open critical cases on SKU-4821"
      - "show me all escalations for this customer"

  - name: createCase
    description:
      Opens a new customer support case with type, severity, subject, related SKU and lot,
      returning the case id, SLA response deadline, assigned agent, and queue rank. During a
      recall create one case per customer so each has its own auditable thread. Use to log a
      customer-facing issue.
    tags: [cases, write, support, escalation, recall]
    aliases: [open a case, raise a ticket, log a complaint, create escalation, start a case, proactive case]
    examples:
      - "open a critical safety case for each affected customer"
      - "raise a case against this lot for the customer"

  - name: updateCase
    description:
      Updates status, severity, owner, resolution notes, or linked recall campaign on an
      existing case, returning the revision number. Use to escalate cases in bulk once a defect
      is confirmed, or to close them after remediation.
    tags: [cases, write, support, escalation, status]
    aliases: [escalate the case, close the case, reassign, update ticket, change severity, add resolution notes, link to recall]
    examples:
      - "escalate CASE-150500 to critical and link it to the recall"
      - "close those cases now that replacements shipped"

  - name: getCaseMetrics
    description:
      Returns aggregate service-desk metrics for a scope and window including case volume by
      type and severity, SLA attainment, mean time to resolve, backlog trend, and agent
      utilization. Use to judge whether support has headroom to absorb a recall wave.
    tags: [cases, read, metrics, sla, capacity, service-desk]
    aliases: [case volume, SLA attainment, MTTR, support backlog, agent capacity, can support handle it, desk metrics]
    examples:
      - "how is the support desk performing this month"
      - "does support have capacity for a recall wave"

  # ---------------------------------------------------------------- recalls
  - name: createRecallCampaign
    description:
      Opens a formal product recall or field-corrective-action campaign against one or more
      manufacturing lots with a regulatory classification, returning the campaign id plus
      regulatory and customer notification deadlines. Every downstream case, notice, visit, and
      credit should reference this id. Use to formally launch a recall.
    tags: [recalls, write, campaign, safety, regulatory]
    aliases: [start a recall, launch recall, field corrective action, FCA, class I recall, recall campaign, safety action]
    examples:
      - "open a class I recall for lot LOT-175302"
      - "launch a field corrective action for this defect"

  - name: getRecallCampaign
    description:
      Retrieves a recall campaign with current scope, affected customer count, units recovered,
      completion percentage, days remaining against the regulatory clock, and estimated cost.
      Use to check progress on an active recall.
    tags: [recalls, read, campaign, progress, status]
    aliases: [recall status, how is the recall going, units recovered, completion, regulatory deadline, recall progress]
    examples:
      - "what is the status of recall RCL-468453"
      - "how many units have we recovered so far"

  - name: addAffectedCustomers
    description:
      Attaches the traced customer list to a recall campaign, generating a per-customer work
      item with units, handling priority, and notification due date. Converts a lot-level
      finding into a concrete work list. Use immediately after tracing a lot.
    tags: [recalls, write, customers, work-items, registration]
    aliases: [register customers on the recall, add affected customers, build the work list, assign priorities, recall work items]
    examples:
      - "register all affected customers on the recall campaign"
      - "add these customers with immediate priority for strategic accounts"

  - name: getRecallReadiness
    description:
      Checks whether the organisation can actually execute a recall, covering replacement stock,
      field service capacity, notification coverage, and regulatory filing status, and returns
      blockers plus the earliest realistic start date. Use before promising a completion date.
    tags: [recalls, read, readiness, execution, blockers, capacity]
    aliases: [can we execute the recall, are we ready, blockers, what is stopping us, readiness check, earliest start]
    examples:
      - "can we actually run this recall right now"
      - "what is blocking execution and when could we realistically start"

  # ---------------------------------------------------------------- warranty
  - name: getWarrantyCoverage
    description:
      Returns the warranty position for a SKU optionally narrowed to a customer or lot, with
      term length, average months remaining, units in and out of warranty, covered components,
      and exclusions. Use to check whether a defect population is still covered.
    tags: [warranty, read, coverage, entitlement]
    aliases: [is it under warranty, warranty coverage, how long is the warranty, exclusions, months remaining, still covered]
    examples:
      - "is lot LOT-175302 still under warranty"
      - "what does the warranty cover and what voids it"

  - name: listWarrantyClaims
    description:
      Lists warranty claims filtered by customer, SKU, lot, or status with units, reported
      failure mode, claim value, and the dominant failure mode across results. A cluster of
      claims against one lot is often the earliest external signal of a systemic defect. Use to
      find early warning signs.
    tags: [warranty, read, claims, failure-mode, early-warning]
    aliases: [warranty claims, failure reports, what are customers claiming, failure mode, claim history, are there complaints]
    examples:
      - "what warranty claims exist against this lot"
      - "what failure mode are customers reporting most"

  - name: createWarrantyClaim
    description:
      Raises a warranty claim on behalf of a customer with units, failure mode, and optional
      recall linkage, returning approved value, settlement method, and whether it was
      auto-approved. Claims linked to a recall skip manual review. Use to spare customers
      paperwork for a defect that is not their fault.
    tags: [warranty, write, claims, proactive, remedy]
    aliases: [raise a claim, file warranty claim, proactive claim, auto approve claim, claim on their behalf, settle under warranty]
    examples:
      - "raise proactive warranty claims for all affected customers"
      - "file a claim for these units under the recall"

  - name: estimateWarrantyLiability
    description:
      Models expected warranty liability for a defect population using failure rate, units
      affected, and replacement cost, returning a point estimate, low and high bounds, and a
      recommended reserve. Use when finance needs a number to book against a known defect.
    tags: [warranty, write, liability, finance, reserve, estimate]
    aliases: [warranty exposure, how much will this cost, reserve, provision, liability estimate, expected failures]
    examples:
      - "estimate warranty liability for 3161 affected units at a 22 percent failure rate"
      - "what reserve should finance book for this defect"

  # ---------------------------------------------------------------- field service
  - name: listTechnicians
    description:
      Lists field service technicians with region, certifications, current utilization, spare
      hours per week, and home base, filterable to only those with availability. A recall
      requiring on-site work is constrained by certified technicians, not parts alone. Use to
      find who can do the work.
    tags: [field-service, read, technicians, certifications, availability]
    aliases: [who can do the work, technicians, engineers, certified staff, available techs, field resources, high voltage certified]
    examples:
      - "which NA technicians are certified for high voltage work"
      - "who has spare capacity this week"

  - name: getServiceCapacity
    description:
      Compares regional field service capacity against a proposed workload and returns weeks to
      complete, capacity gap against a four-week target, and whether contractor augmentation is
      needed. Use to size a field campaign before committing to a schedule.
    tags: [field-service, read, capacity, planning, contractors]
    aliases: [do we have capacity, how long will it take, field capacity, need contractors, weeks to complete, resource gap]
    examples:
      - "can NA field service complete 150 visits within a month"
      - "will we need contractors for this campaign"

  - name: scheduleFieldVisit
    description:
      Books an on-site technician visit at a customer location for inspection, repair,
      replacement, or audit, returning assigned technician, date, arrival window, estimated
      duration, and parts dispatched. Use to arrange physical work at a customer site.
    tags: [field-service, write, visit, scheduling, dispatch]
    aliases: [send a technician, book a site visit, schedule an engineer, dispatch, on site repair, arrange a visit, truck roll]
    examples:
      - "schedule an emergency replacement visit for Contoso"
      - "send a technician on site to swap the affected units"

  # ---------------------------------------------------------------- finance
  - name: listInvoices
    description:
      Lists customer invoices filtered by customer, status, or SKU with amount, issue and due
      dates, days overdue, and whether the invoice contains an affected SKU. During a quality
      escalation unpaid invoices for affected product are usually disputed first. Use for
      billing and receivables questions.
    tags: [finance, read, invoices, receivables, billing]
    aliases: [invoices, unpaid bills, overdue invoices, what do they owe, disputed invoice, billing history, outstanding balance]
    examples:
      - "what invoices are overdue for Contoso"
      - "which unpaid invoices include the affected SKU"

  - name: getCreditExposure
    description:
      Returns the credit position for a customer with limit, outstanding balance, overdue
      amount, available headroom, payment behaviour, credit hold status, and days sales
      outstanding. Use to decide how much of a remedy can be settled as credit versus cash.
    tags: [finance, read, credit, exposure, risk]
    aliases: [credit limit, credit hold, how much do they owe, DSO, payment behaviour, available credit, are they a credit risk]
    examples:
      - "what is Contoso credit exposure and are they on hold"
      - "how much credit headroom does this account have"

  - name: issueCreditMemo
    description:
      Issues a credit memo against a customer account for a reason such as recall remedy, SLA
      breach, or goodwill, returning the approval path required since large credits need finance
      sign-off. Use to actually compensate a customer.
    tags: [finance, write, credit-memo, remedy, goodwill, approval]
    aliases: [issue a credit, credit note, refund them, goodwill gesture, compensate the customer, apply credit to invoice]
    examples:
      - "issue a credit memo for the service credits owed"
      - "give this customer a goodwill credit against their open invoice"

  - name: estimateRecallCost
    description:
      Builds a full cost model for a recall across replacement product, reverse logistics, field
      labour, customer credits, and regulatory administration, returning total cost, cost per
      unit, the largest driver, and a sensitivity note. This is the number that decides whether a
      recall is scoped narrowly or broadly. Use to cost a campaign.
    tags: [finance, write, recall, cost-model, estimate]
    aliases: [what will the recall cost, recall cost, cost per unit, cost breakdown, biggest cost driver, campaign cost]
    examples:
      - "what would a full replacement recall cost for 3161 units"
      - "break down the recall cost and tell me the biggest driver"

  # ---------------------------------------------------------------- governance
  - name: sendCustomerNotification
    description:
      Sends a formal notification to one or more customers over their preferred channel using a
      template such as recall notice or quality advisory, returning a per-recipient delivery
      receipt and a legal evidence reference. Delivery can fail, and failures are reported
      explicitly. Use to formally notify customers.
    tags: [governance, write, notification, recall, evidence, communication]
    aliases: [notify customers, send recall notice, tell the customers, advisory, customer communication, proof of notification]
    examples:
      - "send an urgent recall notice to all affected customers"
      - "notify them and give me proof of notification"

  - name: fileRegulatoryReport
    description:
      Files a mandatory report with a regulatory authority such as CPSC, NHTSA, or EU RAPEX for a
      safety or quality event, returning the filing reference, expected acknowledgement date,
      statutory follow-up obligations, and whether public disclosure is mandated. Use to meet a
      regulatory notification duty.
    tags: [governance, write, regulatory, compliance, filing, safety]
    aliases: [file with the regulator, CPSC, NHTSA, RAPEX, regulatory notification, mandatory report, public disclosure]
    examples:
      - "file an initial notification with CPSC for this recall"
      - "what follow-up obligations do we have after filing"

  - name: createApprovalRequest
    description:
      Raises an approval request and resolves the approver chain from request type and monetary
      value, returning who must decide, the SLA in hours, and the decision deadline. Recall
      launches always reach executive level. Use to gate irreversible or material decisions.
    tags: [governance, write, approval, workflow, authorization]
    aliases: [get approval, sign off, who needs to approve, approval chain, authorize the recall, escalate for decision]
    examples:
      - "raise an emergency approval to launch this recall"
      - "who needs to sign off on a credit of this size"
```