export const audienceMap: Record<string, string | null> = {
  'All Leads': null,
  'New Leads': 'new',
  'Contacted Leads': 'contacted',
  'Interested Leads': 'interested',
  'Negotiation Leads': 'negotiation',
  'Visitor Leads': 'visitor',
  'Follow-up Leads': null, // handled specially via followUp.active — see campaignController
  'Closed Leads': 'closed',
  'Lost Leads': 'lost',
};