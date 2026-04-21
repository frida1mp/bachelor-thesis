# LLM Accessibility Pipeline

Workflow:
  npm run capture-session -- supplier    # log in as supplier                                                                                                                                                 
  npm run capture-session -- buyer       # log in as buyer (when ready)                                                                                                                                       
  npm run fetch-sites                    # uses the right cookies per URL automatically                                                                                                                                                                                                                                                
  npm run clean          # strip noise to make content smaller (NEW - run once after fetch)                                                                                                                                             
  npm run all            # baseline → prompt1 → prompt2 → analyze → archive                                                                                                                                   
        