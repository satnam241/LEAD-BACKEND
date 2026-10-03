"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audienceMap = void 0;
exports.audienceMap = {
    'All Leads': null,
    'Hot Leads': null, // handled via interestLevel: 'hot' — see campaignController
    'Warm Leads': null, // handled via interestLevel: 'warm' — see campaignController
    'Cold Leads': null, // handled via interestLevel: 'cold' — see campaignController
    'Due Follow-up Leads': null, // handled via followUp.active: true AND followUp.date <= now
    'Follow-up Leads': null, // handled specially via followUp.active — see campaignController
    'New Leads': 'new',
    'Contacted Leads': 'contacted',
    'Interested Leads': 'interested',
    'Negotiation Leads': 'negotiation',
    'Visitor Leads': 'visitor',
    'Closed Leads': 'closed',
    'Lost Leads': 'lost',
};
//# sourceMappingURL=audienceMap.js.map