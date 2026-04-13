# LLM Accessibility Pipeline

Workflow:
  npm run fetch-sites    # capture HTML                                                                                                                                                                         
  npm run clean          # strip noise to make content smaller (NEW - run once after fetch)                                                                                                                                             
  npm run all            # baseline → prompt1 → prompt2 → analyze → archive                                                                                                                                   
        