import * as skillsCore from '@flazz/core/dist/skills/api.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerSkillsHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['skills:list'] = async () => {
    return skillsCore.listSkills();
  };
  handlers['skills:view'] = async (_event, args) => {
    return skillsCore.viewSkill(args.name);
  };
  handlers['skills:listCandidates'] = async () => {
    return skillsCore.listSkillCandidates();
  };
  handlers['skills:promoteCandidate'] = async (_event, args) => {
    return skillsCore.promoteSkillCandidate(args.signature);
  };
  handlers['skills:rejectCandidate'] = async (_event, args) => {
    return skillsCore.rejectSkillCandidate(args.signature);
  };
  handlers['skills:getLearningStats'] = async () => {
    return skillsCore.getSkillLearningStats();
  };
  handlers['skills:listRepairCandidates'] = async () => {
    return skillsCore.listSkillRepairCandidates();
  };
  handlers['skills:listRevisions'] = async (_event, args) => {
    return skillsCore.listSkillRevisions(args.name);
  };
  handlers['skills:viewRevision'] = async (_event, args) => {
    return skillsCore.viewSkillRevision(args.name, args.revisionId);
  };
  handlers['skills:rollbackToRevision'] = async (_event, args) => {
    return skillsCore.rollbackSkillToRevision(args.name, args.revisionId);
  };
}
